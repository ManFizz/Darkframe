import PrivateData from "@data/private";
import {setGallery} from "@controllers/AppInitializerController";
import {GetThumbByData} from "@controllers/GalleryController";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";

const favUrl = `https://rule34.xxx/index.php?page=favorites&s=view&id=${PrivateData.R34UserId}`;
const API_URL = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&api_key=${PrivateData.R34ApiKey}&user_id=${PrivateData.R34UserId}`;

let favoriteAbortController = null;

export async function DisplayRemoteFavoriteR34() {

    if (favoriteAbortController) {
        favoriteAbortController.abort();
    }

    favoriteAbortController = new AbortController();
    const signal = favoriteAbortController.signal;

    let allProcessedData = [];
    let pid = 0;
    const postsPerPage = 50;
    let hasMore = true;

    try {
        while (hasMore) {
            if (signal.aborted) throw new Error("AbortError");

            const currentFavUrl = `${favUrl}&pid=${pid}`;

            const response = await fetch(currentFavUrl, { signal });
            const html = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const postIds = Array.from(doc.querySelectorAll("span.thumb a"))
                .map(post => post.getAttribute("id").replace(/\D/g, ''));

            if (postIds.length === 0 || signal.aborted) break;

            const detailedPosts = await fetchPostDetails(postIds, signal);

            let chunkData = detailedPosts.map(post => GetThumbByData({
                remoteId: post.id,
                previewUrl: post.preview_url,
                thumbUrl: post.file_url,
                remoteType: SOURCE_TYPES.R34,
                tags: post.tags,
                sourceUrl: `https://rule34.xxx/index.php?page=post&s=view&id=${post.id}`,
                type: (post.file_url.endsWith(".mp4") || post.file_url.endsWith(".webm")) ? FILE_TYPES.VIDEO : FILE_TYPES.IMAGE
            }));
            chunkData = chunkData.filter(item => item !== null);
            allProcessedData = [...allProcessedData, ...chunkData];
            if (!signal.aborted) {
                setGallery(allProcessedData);
            }

            pid += postsPerPage;
            await new Promise(r => setTimeout(r, 500));
        }
    } catch (error) {
        if (error.name === 'AbortError' || error.message === 'AbortError') {
            console.log(">>> [R34] Загрузка успешно прервана пользователем.");
        } else {
            console.error(">>> [R34] Ошибка:", error);
        }
    }
}

// rule34's API rate-limits bursts, so we cap how many detail requests run at once
// and back off (honouring Retry-After) when it answers 429/503 instead of firing
// one request per id simultaneously.
const DETAIL_CONCURRENCY = 3;
const MAX_RETRIES = 5;
const BASE_BACKOFF = 600;

const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
});

// Fetch JSON, retrying on 429/503 with exponential backoff + jitter. Returns null
// for other non-OK responses; aborts propagate.
async function fetchJsonWithRetry(url, signal, attempt = 0) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const res = await fetch(url, { signal });

    if (res.status === 429 || res.status === 503) {
        if (attempt >= MAX_RETRIES) return null;
        const retryAfter = parseInt(res.headers.get('Retry-After'), 10);
        const wait = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : BASE_BACKOFF * 2 ** attempt + Math.random() * 300;
        await sleep(wait, signal);
        return fetchJsonWithRetry(url, signal, attempt + 1);
    }

    if (!res.ok) return null;
    return res.json();
}

// Run `worker` over `items` with at most `limit` in flight at a time.
async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const run = async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
}

async function fetchPostDetails(ids, signal) {
    const results = await mapLimit(ids, DETAIL_CONCURRENCY, async (id) => {
        try {
            const data = await fetchJsonWithRetry(`${API_URL}&tags=id:${id}`, signal);
            return data?.[0] ?? null;
        } catch (e) {
            if (e.name === 'AbortError') throw e;   // let the caller stop the whole load
            return null;
        }
    });
    return results.filter(Boolean);
}

export function StopR34Loading() {
    if (favoriteAbortController) {
        favoriteAbortController.abort();
        favoriteAbortController = null;
    }
}
