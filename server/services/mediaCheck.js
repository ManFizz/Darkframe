const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Is a downloaded file whole? Sites sometimes hand out a broken copy: the
 * connection drops and the picture ends in a grey / green half, a video stops
 * playing midway. Checked here so the download can be tried again:
 *
 *   - fewer bytes than the server announced;
 *   - images: decoded to the last pixel (a cut-off JPEG / PNG / WebP / GIF fails);
 *   - videos: the container opens and the last seconds decode.
 *
 * checkMedia(file, { expectedSize, ext }) → null when fine, else what's wrong (text).
 */
const IMAGE = /\.(jpe?g|jfif|png|webp|gif|avif|bmp)$/i;
const VIDEO = /\.(mp4|m4v|webm|mov|mkv|avi)$/i;

function run(bin, args, timeout = 60000) {
    return new Promise((resolve) => {
        execFile(bin, args, { timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
            (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }));
    });
}

// The end-of-image marker of a JPEG (some encoders pad with zeros after it).
function jpegHasEnd(buf) {
    let end = buf.length;
    while (end > 2 && buf[end - 1] === 0x00) end--;
    const tail = buf.subarray(Math.max(0, end - 32), end);
    for (let i = tail.length - 2; i >= 0; i--) if (tail[i] === 0xff && tail[i + 1] === 0xd9) return true;
    return false;
}

async function checkImage(file) {
    const sharp = require('sharp');
    const buf = fs.readFileSync(file);
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
    if (isJpeg && !jpegHasEnd(buf)) return 'картинка обрезана (нет конца JPEG)';
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        && !buf.subarray(Math.max(0, buf.length - 16)).includes(Buffer.from('IEND'))) {
        return 'картинка обрезана (нет конца PNG)';
    }
    try {
        // Every pixel: a picture cut short fails here even when its header is fine.
        await sharp(buf, { failOn: 'truncated', pages: 1, limitInputPixels: false }).raw().toBuffer();
    } catch (e) {
        return `картинка повреждена (${String(e.message || e).split('\n')[0]})`;
    }
    return null;
}

async function checkVideo(file) {
    const ffprobe = require('ffprobe-static').path;
    const ffmpeg = require('ffmpeg-static');
    const probe = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], 30000);
    const duration = parseFloat(probe.stdout);
    if (probe.code !== 0 || !(duration > 0)) return `видео не открывается${probe.stderr ? ` (${probe.stderr.trim().split('\n')[0]})` : ''}`;
    // The last seconds: a file cut short has nothing there.
    const from = Math.max(0, duration - 3);
    const tail = await run(ffmpeg, ['-v', 'error', '-ss', String(from), '-i', file, '-map', '0:v:0?', '-frames:v', '3', '-f', 'framemd5', '-'], 60000);
    const frames = tail.stdout.split('\n').filter(l => l && !l.startsWith('#')).length;
    const bad = /partial file|stream ends prematurely|invalid data|truncat|corrupt/i.test(tail.stderr);
    if (bad || (frames === 0 && /Stream #0:\d.*Video/.test(await streamsOf(ffprobe, file)))) {
        return `видео обрывается${tail.stderr ? ` (${tail.stderr.trim().split('\n')[0]})` : ''}`;
    }
    return null;
}

async function streamsOf(ffprobe, file) {
    const r = await run(ffprobe, ['-hide_banner', file], 30000);
    return r.stderr;
}

// `ext` — the type when the file name doesn't tell it (".download" temp files).
async function checkMedia(file, { expectedSize = null, ext = null } = {}) {
    let size;
    try { size = fs.statSync(file).size; } catch { return 'файл не сохранился'; }
    if (!size) return 'пустой файл';
    if (expectedSize > 0 && size < expectedSize) return `скачано ${size} из ${expectedSize} байт`;
    const name = ext ? `x${ext}` : path.basename(file);
    if (IMAGE.test(name)) return checkImage(file);
    if (VIDEO.test(name)) return checkVideo(file);
    return null;
}

module.exports = { checkMedia, jpegHasEnd };
