const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
const electron = require(require.resolve('electron', { paths: [sandbox.ROOT] }));
const { readClipboardImageBuffer } = require(S('services', 'clipboardImage'));

let clip = null;   // Buffer of the picture currently on the clipboard, or null
electron.clipboard = {
    read: async () => (clip ? [{
        types: ['text/plain', 'image/png'],
        getType: async (type) => {
            assert.equal(type, 'image/png');
            return new Blob([clip], { type });
        },
    }] : []),
};
// ELECTRON_RUN_AS_NODE has no nativeImage; the handler only needs these three calls.
electron.nativeImage = {
    createFromBuffer: (buf) => ({
        isEmpty: () => !buf?.length,
        toPNG: () => buf,
        resize: () => ({ toDataURL: () => `data:image/png;base64,${buf.toString('base64')}` }),
    }),
};

const handlers = {};
electron.ipcMain.handle = (channel, fn) => { handlers[channel] = fn; };

let similarity, importService;
const src = path.join(sandbox.dir, 'src');

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(src, { recursive: true });
    similarity = require(S('services', 'similarity'));
    importService = require(S('services', 'importService'));
    require(S('controllers', 'libraryController')).register();
});
test.after(() => sandbox.cleanup());

function item(types, bytesByType) {
    return {
        types,
        getType: async (type) => new Blob([bytesByType[type]], { type }),
    };
}

test('clipboard.read() yields the png, not the removed readImage()', async () => {
    const png = Buffer.from([1, 2, 3, 4]);
    const jpeg = Buffer.from([9, 9]);
    const buf = await readClipboardImageBuffer({
        readImage() { throw new Error('readImage was removed in Electron 44'); },
        read: async () => [item(['image/jpeg', 'text/html', 'image/png'], { 'image/png': png, 'image/jpeg': jpeg })],
    });
    assert.deepEqual(buf, png);
});

test('no picture on the clipboard', async () => {
    const buf = await readClipboardImageBuffer({
        read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['hi']) }],
    });
    assert.equal(buf, null);
});

test('visual search from the clipboard finds the imported picture', async () => {
    const scene = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 30, g: 40, b: 60 } } })
        .composite([{
            input: { create: { width: 120, height: 100, channels: 3, background: { r: 230, g: 200, b: 40 } } },
            left: 40, top: 30,
        }])
        .png()
        .toBuffer();
    const p = path.join(src, 'clip.png');
    fs.writeFileSync(p, scene);
    const id = (await importService.importFile({ filePath: p })).item.id;
    await similarity.computeMissing();

    clip = scene;
    const res = await handlers['library:visualSearch']({}, { clipboard: true });
    assert.equal(res.error, undefined);
    assert.equal(res.results[0].id, id);
    assert.ok(res.preview.startsWith('data:image/png;base64,'));

    clip = null;
    const empty = await handlers['library:visualSearch']({}, { clipboard: true });
    assert.equal(empty.error, 'В буфере обмена нет картинки');
});
