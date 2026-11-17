const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

// Pure ffmpeg/ffprobe helpers (no Electron / DB), shared by the video editing
// service. Kept dependency-free so they can be exercised from plain node.
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const THUMB_SIZE = 400;
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const isUrl = (s) => /^https?:\/\//i.test(String(s || ''));

// "HH:MM:SS.xx" → seconds
function timemarkToSec(mark) {
    if (!mark) return 0;
    const parts = String(mark).split(':').map(Number);
    return parts.reduce((acc, p) => acc * 60 + (isFinite(p) ? p : 0), 0);
}

function probe(src) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(src, (err, meta) => {
            if (err) return resolve({ duration: null, width: 0, height: 0 });
            const v = meta?.streams?.find(s => s.codec_type === 'video');
            resolve({
                duration: Number(meta?.format?.duration) || null,
                width:  v?.width  || 0,
                height: v?.height || 0,
            });
        });
    });
}

// Input options for remote sources: booru CDNs want a browser UA and often a
// same-site Referer (hot-link protection).
function remoteInputOptions(src, referer) {
    if (!isUrl(src)) return [];
    const opts = ['-user_agent', USER_AGENT];
    if (referer) opts.push('-headers', `Referer: ${referer}\r\n`);
    return opts;
}

function run(cmd, { total, onProgress } = {}) {
    return new Promise((resolve, reject) => {
        cmd
            .on('progress', (p) => {
                if (!onProgress || !total) return;
                const done = timemarkToSec(p.timemark);
                onProgress(Math.max(0, Math.min(100, (done / total) * 100)));
            })
            .on('end', () => resolve())
            .on('error', (err, _stdout, stderr) => {
                const tail = String(stderr || '').split('\n').filter(Boolean).slice(-3).join(' | ');
                reject(new Error(tail ? `${err.message} — ${tail}` : err.message));
            })
            .run();
    });
}

// Encoder settings per output container for a frame-accurate (re-encoded) cut.
function preciseCodecOptions(ext) {
    switch (ext) {
        case '.webm':
            return ['-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-row-mt', '1',
                    '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '128k'];
        case '.avi':
            return ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                    '-c:a', 'libmp3lame', '-b:a', '192k'];
        case '.mp4':
        case '.mov':
            return ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
        default:   // .mkv and anything else
            return ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k'];
    }
}

/**
 * Cut [start, end] (seconds) out of `src` into `dst` (same container as dst's ext).
 *   mode 'fast'    — stream copy: instant & lossless, but snaps to keyframes.
 *   mode 'precise' — re-encode: frame-accurate, slower, visually lossless-ish.
 */
function trimFile(src, dst, { start, end, mode = 'precise', onProgress } = {}) {
    const duration = Math.max(0.05, end - start);
    const ext = path.extname(dst).toLowerCase();

    let cmd = ffmpeg(src)
        .inputOptions(['-ss', start.toFixed(3)])
        .outputOptions(['-t', duration.toFixed(3)]);

    cmd = mode === 'fast'
        ? cmd.outputOptions(['-c', 'copy', '-avoid_negative_ts', 'make_zero'])
        : cmd.outputOptions(preciseCodecOptions(ext));

    return run(cmd.outputOptions(['-y']).output(dst), { total: duration, onProgress });
}

// One full-resolution JPEG frame at `time` seconds (q:v 2 ≈ JPEG quality 95).
function captureFrame(src, dst, time, { referer } = {}) {
    const cmd = ffmpeg(src)
        .inputOptions([...remoteInputOptions(src, referer), '-ss', Math.max(0, time).toFixed(3)])
        .outputOptions(['-frames:v', '1', '-q:v', '2', '-y'])
        .output(dst);
    return run(cmd);
}

// Gallery thumbnail (≤400px wide) from the frame at `time` seconds.
function thumbAt(src, dst, time) {
    const cmd = ffmpeg(src)
        .inputOptions(['-ss', Math.max(0, time || 0).toFixed(3)])
        .outputOptions([
            '-frames:v', '1',
            '-vf', `scale='min(${THUMB_SIZE},iw)':-2`,
            '-q:v', '3', '-y',
        ])
        .output(dst);
    return run(cmd);
}

/**
 * Storyboard: `count` evenly spaced frames tiled into one JPEG (seek-bar previews).
 * Decodes key frames only (-skip_frame nokey), so even long videos take a second or
 * two; falls back to a full decode when that yields nothing (odd codecs).
 */
async function storyboard(src, dst, { count = 80, width = 160 } = {}) {
    const { duration, width: vw, height: vh } = await probe(src);
    if (!duration) throw new Error('no duration');
    const cols = 10;
    const rows = Math.ceil(count / cols);
    const h = vw && vh ? Math.max(2, Math.round((width * vh) / vw / 2) * 2) : Math.round(width * 9 / 16 / 2) * 2;
    const vf = `fps=${count}/${duration.toFixed(3)},scale=${width}:${h},tile=${cols}x${rows}`;
    const attempt = (keyOnly) => run(ffmpeg(src)
        .inputOptions(keyOnly ? ['-skip_frame', 'nokey'] : [])
        .outputOptions(['-vf', vf, '-frames:v', '1', '-fps_mode', 'vfr', '-q:v', '5', '-y'])
        .output(dst));
    try {
        await attempt(true);
        if (!fs.existsSync(dst) || fs.statSync(dst).size < 1000) throw new Error('empty');
    } catch {
        await attempt(false);
    }
    return { cols, rows, count, width, height: h, interval: duration / count, duration };
}

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(filePath)
            .on('data', c => h.update(c))
            .on('end', () => resolve(h.digest('hex')))
            .on('error', reject);
    });
}

// Replace `target` with `from` (rename), retrying while Windows still holds a handle
// (a <video> that was just streaming the file). Falls back to copy + unlink.
async function replaceFile(from, target, attempts = 20) {
    for (let i = 0; i < attempts; i++) {
        try {
            fs.renameSync(from, target);
            return;
        } catch (e) {
            if (i === attempts - 1) {
                fs.copyFileSync(from, target);
                try { fs.unlinkSync(from); } catch { /* ignore */ }
                return;
            }
            await new Promise(r => setTimeout(r, 150));
        }
    }
}

/**
 * A container the browser can't play (MPEG-TS from streams / camcorders) → MP4.
 * First a lossless repack (seconds: the streams are copied as they are); if the
 * codecs don't fit MP4 that way, a re-encode (H.264 + AAC).
 */
async function remuxToMp4(src, dst, { onProgress } = {}) {
    const tmp = `${dst}.part.mp4`;
    try {
        await run(ffmpeg(src)
            .outputOptions(['-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', '-y'])
            .output(tmp));
    } catch {
        let total = null;
        try { total = (await probe(src)).duration || null; } catch { /* unknown */ }
        await run(ffmpeg(src)
            .outputOptions(['-map', '0:v:0?', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y'])
            .output(tmp), { total, onProgress });
    }
    fs.renameSync(tmp, dst);
    return dst;
}

/**
 * A video without sound + its sound track, each a separate file (Reddit's v.redd.it
 * serves them as two DASH streams) → one MP4. The streams are copied as they are.
 */
async function muxAudioVideo(videoSrc, audioSrc, dst) {
    const tmp = `${dst}.part.mp4`;
    try {
        await run(ffmpeg()
            .input(videoSrc)
            .input(audioSrc)
            .outputOptions(['-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', '+faststart', '-y'])
            .output(tmp));
        fs.renameSync(tmp, dst);
    } catch (e) {
        fs.rmSync(tmp, { force: true });
        throw e;
    }
    return dst;
}

module.exports = {
    THUMB_SIZE, isUrl, timemarkToSec, probe, remuxToMp4, muxAudioVideo,
    trimFile, captureFrame, thumbAt, storyboard, hashFile, replaceFile,
};
