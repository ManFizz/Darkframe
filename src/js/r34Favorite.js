import PrivateData from "../../data/private";
import {setGallery} from "./AppInitializer";
import {GetThumbByData} from "./Controllers/GalleryController";
import {FILE_TYPES, SOURCE_TYPES} from "./Constants";

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
            await new Promise(r => setTimeout(r, 300));
        }
    } catch (error) {
        if (error.name === 'AbortError' || error.message === 'AbortError') {
            console.log(">>> [R34] Загрузка успешно прервана пользователем.");
        } else {
            console.error(">>> [R34] Ошибка:", error);
        }
    }
}

async function fetchPostDetails(ids, signal) {
    const promises = ids.map(id =>
        fetch(`${API_URL}&tags=id:${id}`, { signal }) // Используем сигнал здесь
            .then(res => res.json())
            .then(data => data[0])
            .catch(() => null)
    );
    return (await Promise.all(promises)).filter(p => p);
}

export function StopR34Loading() {
    if (favoriteAbortController) {
        favoriteAbortController.abort();
        favoriteAbortController = null;
    }
}