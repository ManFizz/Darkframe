const path = require('path');
const { downloadFile } = require('../controllers/fileManager');
const { updateFavoriteLocalUrl } = require('./favoriteService');
const fs = require('fs').promises;

const downloadQueue = [];
let isDownloading = false;

function queueDownload(item) {
    if (!item || !item.id || !item.url) return;
    downloadQueue.push(item);
    setImmediate(processQueue);
}

async function processQueue() {
    if (isDownloading) return;
    isDownloading = true;

    while (downloadQueue.length) {
        const { id, url } = downloadQueue.shift();

        try {
            const downloadPath = path.join(__dirname, '../../downloads');
            await fs.mkdir(downloadPath, { recursive: true });

            const localUrl = await downloadFile(url, downloadPath);

            if (localUrl) {
                try {
                    await updateFavoriteLocalUrl(id, localUrl);
                } catch (err) {
                    console.error(`Failed to update favorite ${id}:`, err);
                }
            } else {
                console.warn(`downloadFile returned falsy for ${url}`);
            }
        } catch (e) {
            console.error("Download error:", e);
        }
    }

    isDownloading = false;
}

module.exports = {
    queueDownload,
    // экспортируем для тестов/вызова вручную
    _internal: {
        processQueue,
        getQueueLength: () => downloadQueue.length
    }
};
