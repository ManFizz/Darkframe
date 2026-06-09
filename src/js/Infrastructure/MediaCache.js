/**
 * Rewrites a remote http(s) media URL to the transparent caching protocol
 * handled in the main process (server/mediaCache.js). Local schemes
 * (library://, file://, data:, blob:) are passed through untouched.
 *
 * Routing every consumer (thumbnail, modal image, neighbour preload, video)
 * through the same mediacache:// URL guarantees each remote file is downloaded
 * only once per session.
 */
export function cachedMediaUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (!/^https?:\/\//i.test(url)) return url;
    return `mediacache://media/?u=${encodeURIComponent(url)}`;
}
