// Chromium refuses requestFullscreen() on <dialog> ("Dialog elements are invalid"),
// so the whole document goes fullscreen and CSS (html:fullscreen) stretches the
// viewer over the topbar. The control bar and nav stay visible that way too.
export function toggleViewerFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
}

export function exitViewerFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
