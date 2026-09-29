const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

/**
 * A Response for a file on disk that honours the Range header (206 + Content-Range).
 * Custom protocols (protocol.handle) need this for <video> seeking: net.fetch on a
 * file:// URL ignores Range and always answers 200 with the whole file.
 */
const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml', '.heic': 'image/heic', '.heif': 'image/heif',
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
};

const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

function parseRange(header, size) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
    if (!m || (m[1] === '' && m[2] === '')) return null;
    let start, end;
    if (m[1] === '') {                 // suffix: last N bytes
        start = Math.max(0, size - Number(m[2]));
        end = size - 1;
    } else {
        start = Number(m[1]);
        end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    return start <= end && start < size ? { start, end } : 'invalid';
}

function fileResponse(file, rangeHeader, extraHeaders = {}) {
    const { size } = fs.statSync(file);
    const base = { 'Content-Type': mimeOf(file), 'Accept-Ranges': 'bytes', ...extraHeaders };
    const range = rangeHeader ? parseRange(rangeHeader, size) : null;

    if (range === 'invalid') {
        return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
    }
    const { start, end } = range || { start: 0, end: size - 1 };
    const body = size ? Readable.toWeb(fs.createReadStream(file, { start, end })) : null;
    const headers = { ...base, 'Content-Length': String(size ? end - start + 1 : 0) };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    return new Response(body, { status: range ? 206 : 200, headers });
}

module.exports = { fileResponse, parseRange, mimeOf };
