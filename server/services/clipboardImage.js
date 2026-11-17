// Electron 44 removed clipboard.readImage(). A picture now comes back from
// clipboard.read() as a ClipboardItem blob (image/png, image/jpeg, …).

const PREFERRED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp'];

function imageTypes(types) {
    const rank = (t) => {
        const i = PREFERRED.indexOf(t);
        if (i !== -1) return i;
        if (typeof t === 'string' && t.startsWith('image/') && t !== 'image/svg+xml') return PREFERRED.length;
        return -1;
    };
    return [...(types || [])].filter(t => rank(t) !== -1).sort((a, b) => rank(a) - rank(b));
}

async function toBuffer(data) {
    const value = await data;
    if (!value) return null;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value.arrayBuffer === 'function') return Buffer.from(await value.arrayBuffer());
    return null;
}

// PNG/JPEG bytes when the clipboard holds a picture, otherwise null.
async function readClipboardImageBuffer(clipboard) {
    if (typeof clipboard?.read !== 'function') return null;
    let items = [];
    try { items = await clipboard.read(); } catch { return null; }
    for (const item of items || []) {
        for (const type of imageTypes(item?.types)) {
            if (typeof item.getType !== 'function') break;
            try {
                const buf = await toBuffer(item.getType(type));
                if (buf?.length) return buf;
            } catch { /* try the next representation */ }
        }
    }
    return null;
}

module.exports = { readClipboardImageBuffer };
