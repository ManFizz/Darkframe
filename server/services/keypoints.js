const sharp = require('sharp');

/**
 * "Is this the same picture?" by keypoints (OpenCV ORB + RANSAC homography): finds a
 * crop, a resize, a mirror, a picture with a frame or a caption added — and tells
 * those apart from two different pictures of the same thing. ~0.1–0.2 s per pair,
 * so it only checks candidates found some other way (services/embeddings).
 *
 * OpenCV runs as WebAssembly (no native build); it loads on first use.
 */

const MAX_SIDE = 800;     // pictures are compared at this size
const FEATURES = 1500;    // ORB keypoints per picture
const RATIO = 0.75;       // Lowe's ratio test
const MIN_INLIERS = 25;   // geometrically consistent matches to call it the same picture
const CACHE = 200;        // pictures whose keypoints a matcher keeps

let cvReady = null;
// Note: the module object is a thenable — never resolve a promise with it directly.
function loadCv() {
    if (!cvReady) {
        cvReady = new Promise((resolve) => {
            const cv = require('@techstark/opencv-js');
            if (cv.Mat) resolve({ cv });
            else cv.onRuntimeInitialized = () => resolve({ cv });
        });
    }
    return cvReady;
}

async function greyMat(cv, file, flip) {
    let img = sharp(file, { failOn: 'none', pages: 1 }).rotate();
    if (flip) img = img.flop();
    const { data, info } = await img
        .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
        .greyscale().raw().toBuffer({ resolveWithObject: true });
    const m = new cv.Mat(info.height, info.width, cv.CV_8UC1);
    m.data.set(data);
    return m;
}

/** Keypoints of an image file. Free with `release` when done. */
async function featuresOf(file, { flip = false } = {}) {
    const { cv } = await loadCv();
    const m = await greyMat(cv, file, flip);
    const orb = new cv.ORB(FEATURES);
    const kp = new cv.KeyPointVector(), des = new cv.Mat(), noMask = new cv.Mat();
    try { orb.detectAndCompute(m, noMask, kp, des); }
    finally { orb.delete(); m.delete(); noMask.delete(); }
    return { kp, des };
}

function release(f) {
    if (!f) return;
    try { f.kp.delete(); f.des.delete(); } catch { /* already freed */ }
}

/** Geometrically consistent keypoint matches between two pictures. */
async function inliersOf(a, b) {
    const { cv } = await loadCv();
    if (!a || !b || a.des.rows < 8 || b.des.rows < 8) return 0;
    const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
    const knn = new cv.DMatchVectorVector();
    const src = [], dst = [];
    try {
        bf.knnMatch(a.des, b.des, knn, 2);
        for (let i = 0; i < knn.size(); i++) {
            const m = knn.get(i);
            if (m.size() < 2) continue;
            const m0 = m.get(0), m1 = m.get(1);
            if (m0.distance < RATIO * m1.distance) {
                const p = a.kp.get(m0.queryIdx).pt, q = b.kp.get(m0.trainIdx).pt;
                src.push(p.x, p.y);
                dst.push(q.x, q.y);
            }
        }
    } finally { bf.delete(); knn.delete(); }
    const good = src.length / 2;
    if (good < MIN_INLIERS) return 0;
    const s = cv.matFromArray(good, 1, cv.CV_32FC2, src), d = cv.matFromArray(good, 1, cv.CV_32FC2, dst);
    const mask = new cv.Mat();
    let inliers = 0;
    try {
        const H = cv.findHomography(s, d, cv.RANSAC, 5, mask);
        H.delete();
        for (let i = 0; i < mask.rows; i++) if (mask.data[i]) inliers++;
    } finally { s.delete(); d.delete(); mask.delete(); }
    return inliers;
}

/**
 * Cache of keypoints for a run over many pairs: `same(fileA, fileB)` →
 * { same, mirrored, inliers }. `close()` frees everything.
 */
function matcher() {
    const cache = new Map();
    const get = async (file, flip) => {
        const key = (flip ? 'M:' : '') + file;
        if (cache.has(key)) {   // most recently used last
            const f = cache.get(key);
            cache.delete(key);
            cache.set(key, f);
            return f;
        }
        const f = await featuresOf(file, { flip }).catch(() => null);
        cache.set(key, f);
        if (cache.size > CACHE) {   // keypoints live in the WebAssembly heap: keep it small
            const [oldest, old] = cache.entries().next().value;
            cache.delete(oldest);
            release(old);
        }
        return f;
    };
    return {
        async same(fileA, fileB) {
            const direct = await inliersOf(await get(fileA, false), await get(fileB, false));
            if (direct >= MIN_INLIERS) return { same: true, mirrored: false, inliers: direct };
            const mirrored = await inliersOf(await get(fileA, true), await get(fileB, false));
            if (mirrored >= MIN_INLIERS) return { same: true, mirrored: true, inliers: mirrored };
            return { same: false, mirrored: false, inliers: Math.max(direct, mirrored) };
        },
        close() { cache.forEach(release); cache.clear(); },
    };
}

module.exports = { featuresOf, inliersOf, release, matcher, MIN_INLIERS };
