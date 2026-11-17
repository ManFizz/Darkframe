// Opens the Manga tab from anywhere (a notice, a command): the top bar switches
// the tab, then the view takes the request (see mangaRequests).
export const openManga = (request = {}) => window.dispatchEvent(new CustomEvent('df:openManga', { detail: request }));
