/**
 * Opening the manga reader from anywhere: openReader(book). The reader itself is
 * mounted once (AppInitializer).
 *
 * book = {
 *   key,                          // unique per book (progress, saved settings)
 *   title,
 *   chapters: [{ id, title, pages: [{ url, w, h, thumb? }] | null }],
 *   loadChapter?(chapterId) → pages   // online sources load chapters lazily
 *   start?: { chapter, page },
 *   reading?: { mode },               // 'vertical' — a webtoon (mode / direction are otherwise global)
 *   onProgress?({ chapter, page, position, total }),
 *   savePage?(page, { page, chapter, chapterTitle }) → { item } | { skipped }
 *   actions?: [{ id, label, icon, run }],
 *   onClose?(),
 * }
 */
let opener = null;
let pending = null;

export function openReader(book) {
    if (opener) opener(book);
    else pending = book;
}

export function registerReader(fn) {
    opener = fn;
    if (pending) { fn(pending); pending = null; }
    return () => { if (opener === fn) opener = null; };
}

// Reader preferences (per viewer, the same for every book).
const KEY = 'jsg_reader';
const DEFAULTS = {
    mode: 'paged',          // paged | double | vertical
    direction: 'rtl',       // rtl (manga) | ltr
    fit: 'screen',          // screen | height | width | original
    verticalWidth: 820,     // px, webtoon column
    gap: 0,                 // px between pages in the vertical mode
    doubleOffset: true,     // double: the cover stands alone
    autoSpeed: 120,         // px / s, vertical autoscroll
    background: 'dark',     // dark | black | light
};

export function readerPrefs() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...DEFAULTS }; }
}

export function saveReaderPrefs(patch) {
    const next = { ...readerPrefs(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
}

// Tall pages (webtoon / manhwa strips) read best as one continuous column.
export function looksVertical(pages) {
    const known = (pages || []).filter(p => p.w > 0 && p.h > 0).slice(0, 12);
    if (known.length < 2) return false;
    const ratios = known.map(p => p.h / p.w).sort((a, b) => a - b);
    return ratios[Math.floor(ratios.length / 2)] > 2.0;
}
