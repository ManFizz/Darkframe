const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const THUMB_SIZE = 400;

async function generateImageThumb(srcPath, thumbPath) {
    await sharp(srcPath)
        .resize(THUMB_SIZE, THUMB_SIZE, {
            fit: 'inside',
            withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);

    const meta = await sharp(srcPath).metadata();
    return { width: meta.width || 0, height: meta.height || 0 };
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

module.exports = { generateImageThumb, generateVideoThumb, getVideoDuration };
