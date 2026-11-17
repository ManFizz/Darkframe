const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { probe } = require('./ffmpegOps');
const { hashPixels, popcount32 } = require('./phash');

/**
 * Similar-video fingerprint: the pHash of a few frames across the video plus its
 * duration — "12.34|a1b2…,c3d4…,-,…" ('-' = a near-blank frame, which says nothing).
 * Re-encoded, resized, re-muxed copies keep their frames' hashes; a cut or a longer
 * version still shares most frames with the other, at other positions.
 */

const POSITIONS = [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92];
const N = 32;

// One frame at `time` as N×N greyscale pixels (ffmpeg scales it), or null.
function frameAt(file, time) {
    return new Promise((resolve) => {
        const args = ['-v', 'error', '-ss', time.toFixed(3), '-i', file, '-frames:v', '1',
            '-vf', `scale=${N}:${N}:flags=area`, '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'];
        const p = spawn(ffmpegPath, args, { windowsHide: true });
        const chunks = [];
        p.stdout.on('data', c => chunks.push(c));
        p.on('error', () => resolve(null));
        p.on('close', () => {
            const buf = Buffer.concat(chunks);
            resolve(buf.length >= N * N ? buf.subarray(0, N * N) : null);
        });
    });
}

function isBlank(px) {
    let sum = 0, sq = 0;
    for (const v of px) { sum += v; sq += v * v; }
    const mean = sum / px.length;
    return Math.sqrt(Math.max(0, sq / px.length - mean * mean)) < 6;
}

/** Fingerprint of a video file, or '' when it couldn't be read. */
async function vhashOf(file) {
    const { duration } = await probe(file);
    if (!duration) return '';
    const frames = [];
    for (const pos of POSITIONS) {
        const px = await frameAt(file, duration * pos);
        frames.push(!px ? '' : isBlank(px) ? '-' : hashPixels(px));
    }
    if (frames.filter(f => f && f !== '-').length < 3) return '';
    return `${duration.toFixed(2)}|${frames.map(f => f || '-').join(',')}`;
}

/** Parsed fingerprint: { duration, hi: Uint32Array, lo: Uint32Array } of the useful frames. */
function parseVhash(s) {
    const [dur, list] = String(s || '').split('|');
    const frames = (list || '').split(',').filter(f => /^[0-9a-f]{16}$/i.test(f));
    return {
        duration: Number(dur) || 0,
        hi: Uint32Array.from(frames, f => parseInt(f.slice(0, 8), 16) >>> 0),
        lo: Uint32Array.from(frames, f => parseInt(f.slice(8), 16) >>> 0),
    };
}

const MIN_FRAMES = 3;

/**
 * How alike two parsed fingerprints are: for each frame of one, the closest frame of
 * the other. Similar when at least MIN_FRAMES frames of either video have a match
 * within `maxDistance` bits — so a cut of a longer video counts too. Returns the mean
 * distance of the matched frames, or null.
 */
function compareVhash(a, b, maxDistance) {
    const side = (x, y) => {
        let matched = 0, total = 0;
        for (let i = 0; i < x.hi.length; i++) {
            let best = 99;
            for (let j = 0; j < y.hi.length; j++) {
                const d = popcount32(x.hi[i] ^ y.hi[j]) + popcount32(x.lo[i] ^ y.lo[j]);
                if (d < best) best = d;
            }
            if (best <= maxDistance) { matched++; total += best; }
        }
        return { matched, mean: matched ? total / matched : 99 };
    };
    const ab = side(a, b), ba = side(b, a);
    const best = ab.matched >= ba.matched ? ab : ba;
    if (best.matched < Math.min(MIN_FRAMES, a.hi.length, b.hi.length)) return null;
    return Math.round(best.mean * 10) / 10;
}

module.exports = { vhashOf, parseVhash, compareVhash };
