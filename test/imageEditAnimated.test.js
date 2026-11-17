const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Animated GIF editing: every frame rotated / cropped / recoloured, the animation
// (frame count, delays, loop) kept.
const S = sandbox.serverPath;
let importFile, editImage, revertImage, Item;

async function makeGif(file) {
    const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
    const frames = await Promise.all(colors.map(([r, g, b]) =>
        sharp({ create: { width: 40, height: 20, channels: 4, background: { r, g, b, alpha: 1 } } }).raw().toBuffer()));
    const buf = await sharp(Buffer.concat(frames), { raw: { width: 40, height: 60, channels: 4, pageHeight: 20 } })
        .gif({ delay: [120, 80, 200], loop: 0 }).toBuffer();
    fs.writeFileSync(file, buf);
}

test.before(async () => {
    await sandbox.initDb();
    ({ importFile } = require(S('services', 'importService')));
    ({ editImage, revertImage } = require(S('services', 'imageEditService')));
    ({ Item } = require(S('models', 'associations')));
});
test.after(() => sandbox.cleanup());

test('animated GIF: rotate 90°, crop, flip and colour keep every frame and its timing', async () => {
    const src = path.join(sandbox.dir, 'anim.gif');
    await makeGif(src);
    const { item } = await importFile({ filePath: src });
    const res = await editImage(item.id, {
        angle: 90, flipH: true, crop: { x: 0, y: 0, w: 1, h: 0.5 },
        color: { brightness: 20, contrast: 0, saturation: 0, gamma: 0 },
    });
    assert.ok(res.ok);
    const dir = path.join(sandbox.itemsPath, item.id);
    const out = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(f => f.startsWith('original.'))));
    const meta = await sharp(out, { animated: true }).metadata();
    assert.equal(meta.format, 'gif');
    assert.equal(meta.pages, 3);
    assert.deepEqual(meta.delay, [120, 80, 200]);
    // 40×20 turned 90° → 20×40, top half kept → 20×20
    assert.equal(meta.width, 20);
    assert.equal(meta.pageHeight, 20);
    const row = await Item.unscoped().findByPk(item.id, { raw: true });
    assert.equal(row.width, 20);

    // Back to the pristine animation.
    await revertImage(item.id);
    const back = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(f => f.startsWith('original.'))));
    const m2 = await sharp(back, { animated: true }).metadata();
    assert.equal(m2.width, 40);
    assert.equal(m2.pages, 3);
});
