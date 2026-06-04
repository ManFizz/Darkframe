const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const THUMB_SIZE = 400;

// HEIF/HEIC magic: bytes 4-7 == 'ftyp'
async function isHeif(filePath) {
    try {
        const buf = Buffer.alloc(8);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buf, 0, 8, 0);
        fs.closeSync(fd);
        return buf.slice(4, 8).toString('ascii') === 'ftyp';
    } catch {
        return false;
    }
}

async function generateImageThumb(srcPath, thumbPath) {
    try {
        await sharp(srcPath)
            .resize(THUMB_SIZE, THUMB_SIZE, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .jpeg({ quality: 80 })
            .toFile(thumbPath);

        const meta = await sharp(srcPath).metadata();
        return { width: meta.width || 0, height: meta.height || 0 };

    } catch (sharpErr) {
        const heif = await isHeif(srcPath);

        if (heif) {
            console.warn(`HEIF detected for ${path.basename(srcPath)}, converting via heic-convert`);
            return generateHeifThumb(srcPath, thumbPath);
        }

        // Last resort: ffmpeg (for any other unsupported format)
        console.warn(
            `Sharp failed for ${path.basename(srcPath)}, trying ffmpeg:`,
            sharpErr.message?.split('\n')[0]
        );
        await generateImageThumbFfmpeg(srcPath, thumbPath);
        return getImageDimensionsFfmpeg(srcPath);
    }
}

async function generateHeifThumb(srcPath, thumbPath) {
    const inputBuffer = await fs.promises.readFile(srcPath);
    const jpegBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 1,
    });

    const buf = Buffer.from(jpegBuffer);

    // Save full-quality JPEG alongside the original for in-app viewing
    // (Chromium can't render HEIC, so we need a display copy)
    const displayPath = path.join(path.dirname(thumbPath), 'display.jpg');
    await fs.promises.writeFile(displayPath, buf);

    // Resize for thumbnail
    await sharp(buf)
        .resize(THUMB_SIZE, THUMB_SIZE, {
            fit: 'inside',
            withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);

    const meta = await sharp(buf).metadata();
    return { width: meta.width || 0, height: meta.height || 0 };
}

function generateImageThumbFfmpeg(srcPath, thumbPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(srcPath)
            .outputOptions([
                '-vframes', '1',
                '-vf', `scale='min(${THUMB_SIZE},iw)':-2`,
            ])
            .output(thumbPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
}

function getImageDimensionsFfmpeg(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return resolve({ width: 0, height: 0 });
            const stream = metadata?.streams?.find(s => s.codec_type === 'video');
            resolve({ width: stream?.width || 0, height: stream?.height || 0 });
        });
    });
}

function generateVideoThumb(srcPath, thumbPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(srcPath)
            .on('end', resolve)
            .on('error', reject)
            .screenshots({
                timestamps: ['10%'],
                filename: path.basename(thumbPath),
                folder: path.dirname(thumbPath),
                size: `${THUMB_SIZE}x?`,
            });
    });
}

function getVideoDuration(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return resolve(null);
            resolve(metadata?.format?.duration || null);
        });
    });
}

// Exported separately so the repair handler can call it without thumb generation
async function generateHeifDisplay(srcPath, displayPath) {
    const inputBuffer = await fs.promises.readFile(srcPath);
    const jpegBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 1,
    });
    await fs.promises.writeFile(displayPath, Buffer.from(jpegBuffer));
}

module.exports = { generateImageThumb, generateVideoThumb, getVideoDuration, generateHeifDisplay };
