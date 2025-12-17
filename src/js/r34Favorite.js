import PrivateData from "../../data/private";
import {setGallery} from "./AppInitializer";
import {FILE_TYPES, SOURCE_TYPES} from "./Display";
import {GetThumbByData} from "./GalleryController";

const favUrl = `https://rule34.xxx/index.php?page=favorites&s=view&id=${PrivateData.R34UserId}`;
const API_URL = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&api_key=${PrivateData.R34ApiKey}&user_id=${PrivateData.R34UserId}`;

export async function DisplayRemoteFavoriteR34() {

    let allProcessedData = [];
    let pid = 0;
    const postsPerPage = 50;
    let hasMore = true;

    try {
        while (hasMore) {
            const currentFavUrl = `${favUrl}&pid=${pid}`;

            const response = await fetch(currentFavUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const postElements = Array.from(doc.querySelectorAll("span.thumb a"));
            const postIds = postElements.map(post => post.getAttribute("id").replace(/\D/g, ''));

            if (postIds.length === 0) {
                console.log(">>> [R34] Все страницы загружены.");
                hasMore = false;
                break;
            }

            const detailedPosts = await fetchPostDetails(postIds);

            const chunkData = detailedPosts.map(post => {
                const isVid = post.file_url.endsWith(".mp4") || post.file_url.endsWith(".webm");

                return GetThumbByData({
                    previewUrl: post.preview_url,
                    thumbUrl: post.file_url,
                    remoteType: SOURCE_TYPES.R34,
                    tags: post.tags,
                    sourceUrl: `https://rule34.xxx/index.php?page=post&s=view&id=${post.id}`,
                    type: isVid ? FILE_TYPES.VIDEO : FILE_TYPES.IMAGE
                });
            });

            allProcessedData = [...allProcessedData, ...chunkData];
            setGallery(allProcessedData);

            pid += postsPerPage;

            await new Promise(r => setTimeout(r, 300));

            if (pid > 5000) {
                console.warn(">>> [R34] Достигнут лимит безопасности в 5000 постов.");
                hasMore = false;
            }
        }
    } catch (error) {
        console.error(">>> [R34] Ошибка при пагинации:", error);
    }
}

async function fetchPostDetails(ids) {
    const promises = ids.map(id =>
        fetch(`${API_URL}&tags=id:${id}`)
            .then(res => res.json())
            .then(data => (data && data.length > 0) ? data[0] : null)
            .catch(() => null)
    );

    const results = await Promise.all(promises);
    return results.filter(p => p !== null);
}