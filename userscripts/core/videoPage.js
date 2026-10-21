// A site whose page shows one video: the panel appears on video pages and saves
// it. The site gives only how to tell a video page and what to read from it.
//
//   videoPage({ id, name, hosts, connect?, side?, isVideoPage(), extract(), notFound? })
//   extract() → { videoUrl, title, tags, notes?, sourceUrl }

const app = require('./app');
const { canonical } = require('./html');

function videoPage({ isVideoPage, extract, notFound = 'Видео не найдено на странице', ...site }) {
    return {
        side: 'right',
        ...site,
        page() {
            if (!isVideoPage()) return null;
            return { label: 'Видео', current: canonical(document, location.href.split('#')[0]), oneLabel: 'Сохранить видео' };
        },
        items: () => [],
        sourceUrl: (id) => id,
        async save(id, ctx) {
            const d = extract();
            if (!d.videoUrl) return { result: 'failed', error: notFound };
            const out = await app.add({
                url: d.videoUrl, sourceUrl: d.sourceUrl, tags: d.tags, title: d.title,
                notes: d.notes || '', collectionId: ctx.collectionId(),
            });
            return { ...out, ids: [...new Set([id, d.sourceUrl])] };
        },
    };
}

module.exports = { videoPage };
