const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { app, net } = require('electron');
const { Item } = require('../models/associations');
const { withTagNames } = require('./itemTags');
const { itemsPath } = require('./importService');

/**
 * Tag suggestions from a local image tagger (WD ViT Tagger v3, ONNX, runs offline
 * on this machine — nothing is uploaded anywhere). The model (~380 MB) is
 * downloaded once, on request, into <userData>/models.
 *
 * Model contract (WD taggers): input NHWC float32 [1,448,448,3], BGR, 0..255, the
 * picture padded to a white square; output [1,N] probabilities in the order of
 * selected_tags.csv (category 9 = rating, 0 = general, 4 = character).
 */
const MODEL = {
    name: 'WD ViT Tagger v3',
    files: {
        'model.onnx': 'https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main/model.onnx',
        'selected_tags.csv': 'https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main/selected_tags.csv',
    },
    size: 448,
};
const DEFAULTS = { general: 0.35, character: 0.85 };

let modelDir = null;
const dir = () => modelDir || path.join(app.getPath('userData'), 'models', 'wd-vit-tagger-v3');
const setModelDir = (d) => { modelDir = d; session = null; tags = null; };   // tests
const settingsFile = () => path.join(app.getPath('userData'), 'autotag.json');

function getSettings() {
    try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; }
    catch { return { ...DEFAULTS }; }
}
function saveSettings(patch) {
    const next = { ...getSettings(), ...patch };
    next.general = Math.min(0.95, Math.max(0.1, Number(next.general) || DEFAULTS.general));
    next.character = Math.min(0.99, Math.max(0.3, Number(next.character) || DEFAULTS.character));
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
    return next;
}

const installed = () => Object.keys(MODEL.files).every(f => fs.existsSync(path.join(dir(), f)));

let download = null;   // { done, total } while downloading

function status() {
    let bytes = 0;
    try { bytes = fs.statSync(path.join(dir(), 'model.onnx')).size; } catch { /* none */ }
    return { model: MODEL.name, installed: installed(), bytes, downloading: download, settings: getSettings() };
}

// Downloads the model files (resumable only in the sense that finished files are kept).
async function downloadModel(onProgress) {
    if (download) throw new Error('Модель уже скачивается');
    fs.mkdirSync(dir(), { recursive: true });
    download = { done: 0, total: 0 };
    try {
        for (const [name, url] of Object.entries(MODEL.files)) {
            const target = path.join(dir(), name);
            if (fs.existsSync(target)) continue;
            const res = await net.fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} (${name})`);
            const total = Number(res.headers.get('content-length')) || 0;
            download.total += total;
            const tmp = target + '.part';
            const out = fs.createWriteStream(tmp);
            const reader = res.body.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r));
                download.done += value.length;
                onProgress?.({ ...download });
            }
            await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
            fs.renameSync(tmp, target);
        }
        return status();
    } finally {
        download = null;
    }
}

function removeModel() {
    session = null;
    tags = null;
    fs.rmSync(dir(), { recursive: true, force: true });
    return status();
}

let session = null;
let tags = null;   // [{ name, category }]

async function ensureSession() {
    if (session) return session;
    if (!installed()) throw new Error('Модель не скачана');
    const ort = require('onnxruntime-node');
    const modelPath = path.join(dir(), 'model.onnx');
    // DirectML (any DX12 GPU on Windows) when it works, CPU otherwise.
    try { session = await ort.InferenceSession.create(modelPath, { executionProviders: ['dml', 'cpu'] }); }
    catch { session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] }); }
    tags = fs.readFileSync(path.join(dir(), 'selected_tags.csv'), 'utf8')
        .split(/\r?\n/).slice(1).filter(Boolean)
        .map(line => { const [, name, category] = line.split(','); return { name: name.trim(), category: Number(category) }; });
    return session;
}

async function toInput(file) {
    const size = MODEL.size;
    const { data } = await sharp(file, { animated: false })
        .flatten({ background: '#ffffff' })           // transparency → white, as in training
        .resize(size, size, { fit: 'contain', background: '#ffffff' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const input = new Float32Array(size * size * 3);
    for (let i = 0; i < data.length; i += 3) {       // RGB → BGR, 0..255
        input[i] = data[i + 2];
        input[i + 1] = data[i + 1];
        input[i + 2] = data[i];
    }
    return input;
}

// Suggested tags of one image file: [{ name, score, category: 'general'|'character' }], best first.
async function tagFile(file, settings = getSettings()) {
    const s = await ensureSession();
    const ort = require('onnxruntime-node');
    const input = new ort.Tensor('float32', await toInput(file), [1, MODEL.size, MODEL.size, 3]);
    const out = await s.run({ [s.inputNames[0]]: input });
    const probs = out[s.outputNames[0]].data;
    const res = [];
    tags.forEach((t, i) => {
        const p = probs[i];
        if (t.category === 0 && p >= settings.general) res.push({ name: t.name, score: p, category: 'general' });
        else if (t.category === 4 && p >= settings.character) res.push({ name: t.name, score: p, category: 'character' });
    });
    return res.sort((a, b) => b.score - a.score);
}

// The picture of a library item the tagger should look at: display.jpg (HEIC),
// the original image, or a video's thumbnail.
function imageOf(item) {
    const d = path.join(itemsPath(), item.id);
    let files = [];
    try { files = fs.readdirSync(d); } catch { return null; }
    if (files.includes('display.jpg')) return path.join(d, 'display.jpg');
    if (String(item.mimeType).startsWith('image/')) {
        const o = files.find(f => /^original\./i.test(f));
        if (o) return path.join(d, o);
    }
    return files.includes('thumb.jpg') ? path.join(d, 'thumb.jpg') : null;
}

// Suggestions for library items, without the tags they already have.
async function suggest(ids, onProgress) {
    const settings = getSettings();
    const rows = await withTagNames(await Item.findAll({ where: { id: ids }, raw: true }));
    const out = {};
    let done = 0;
    for (const item of rows) {
        const file = imageOf(item);
        try {
            const have = new Set(item.tags);
            out[item.id] = file ? (await tagFile(file, settings)).filter(t => !have.has(t.name)) : [];
        } catch (e) {
            out[item.id] = { error: e.message };
        }
        onProgress?.({ done: ++done, total: rows.length });
    }
    return out;
}

module.exports = { status, downloadModel, removeModel, getSettings, saveSettings, suggest, tagFile, setModelDir, MODEL };
