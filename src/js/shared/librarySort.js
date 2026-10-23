/**
 * Library sorting: every way to order the gallery, with what each direction means
 * in words ("newest first"), and a stable tie-break so equal items don't jump
 * around between renders. "Random" is a seeded shuffle: the same seed gives the
 * same order (browsing, the viewer, the slideshow agree); "shuffle" picks a new one.
 */
const ASC = 1, DESC = -1;

const kindRank = (f) => {
    if (f.isManga) return 3;
    const m = String(f.mimeType || '');
    if (m.startsWith('video/')) return 2;
    if (m === 'image/gif') return 1;
    return 0;
};
const ratio = (f) => (f.width > 0 && f.height > 0 ? f.width / f.height : 0);

// value(f) → number | string; dir: labels for [ASC, DESC]; def: the direction picked first.
const SORTS = [
    { id: 'order', label: 'Свой порядок', icon: 'bi-grip-vertical', group: 'Основное', value: f => f.order ?? 0, dir: ['как расставлено', 'в обратном порядке'], def: ASC, hint: 'Можно менять перетаскиванием' },
    { id: 'importedAt', label: 'Дата добавления', icon: 'bi-calendar-plus', group: 'Основное', value: f => f.importedAt || f.time || 0, dir: ['сначала старые', 'сначала новые'], def: DESC, month: true },
    { id: 'title', label: 'Название', icon: 'bi-sort-alpha-down', group: 'Основное', value: f => String(f.title || f.fileName || ''), dir: ['А → Я', 'Я → А'], def: ASC, text: true },
    { id: 'rating', label: 'Рейтинг', icon: 'bi-star', group: 'Основное', value: f => f.rating || 0, dir: ['сначала низкие', 'сначала высокие'], def: DESC },
    { id: 'random', label: 'Случайный', icon: 'bi-shuffle', group: 'Основное', random: true, hint: 'Перемешать заново — кнопка рядом' },

    { id: 'lastViewedAt', label: 'Последний просмотр', icon: 'bi-eye', group: 'Просмотры', value: f => f.lastViewedAt || 0, dir: ['давно не открывал', 'недавно смотрел'], def: DESC, month: true },
    { id: 'viewCount', label: 'Сколько раз открывал', icon: 'bi-graph-up-arrow', group: 'Просмотры', value: f => f.viewCount || 0, dir: ['реже всего', 'чаще всего'], def: DESC },
    { id: 'editedAt', label: 'Дата правки', icon: 'bi-pencil-square', group: 'Просмотры', value: f => f.editedAt || 0, dir: ['давние правки', 'свежие правки'], def: DESC, month: true },

    { id: 'size', label: 'Размер файла', icon: 'bi-hdd', group: 'Файл', value: f => f.size || 0, dir: ['сначала лёгкие', 'сначала тяжёлые'], def: DESC },
    { id: 'pixels', label: 'Разрешение', icon: 'bi-aspect-ratio', group: 'Файл', value: f => (f.width || 0) * (f.height || 0), dir: ['сначала маленькие', 'сначала большие'], def: DESC },
    { id: 'aspect', label: 'Пропорции', icon: 'bi-phone-landscape', group: 'Файл', value: ratio, dir: ['сначала вертикальные', 'сначала горизонтальные'], def: ASC },
    { id: 'duration', label: 'Длительность видео', icon: 'bi-stopwatch', group: 'Файл', value: f => f.duration || 0, dir: ['сначала короткие', 'сначала длинные'], def: DESC },
    { id: 'type', label: 'Тип: фото · GIF · видео · манга', icon: 'bi-collection', group: 'Файл', value: kindRank, dir: ['фото → манга', 'манга → фото'], def: ASC },
    { id: 'tagCount', label: 'Количество тегов', icon: 'bi-tags', group: 'Файл', value: f => f.tags?.length || 0, dir: ['меньше тегов', 'больше тегов'], def: ASC },
    { id: 'pageCount', label: 'Страниц в манге', icon: 'bi-book', group: 'Файл', value: f => f.pageCount || 0, dir: ['меньше страниц', 'больше страниц'], def: DESC },
];

const sortOf = (id) => SORTS.find(s => s.id === id) || SORTS[0];

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('ru', { numeric: true, sensitivity: 'base' }) : null;

// 32-bit hash of seed + id — the position of an item in a shuffle.
function shuffleKey(seed, id) {
    let h = 2166136261 ^ seed;
    const s = String(id);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return h >>> 0;
}

const newSeed = () => (Math.random() * 0xffffffff) >>> 0;

/** Comparator for the gallery: sortBy, order (1 / -1), seed for random. */
function comparator(sortBy, order = ASC, seed = 1) {
    const s = sortOf(sortBy);
    // Equal values: newest first, then by id — the same order on every render.
    const tie = (a, b) => ((b.importedAt || 0) - (a.importedAt || 0)) || String(a.id).localeCompare(String(b.id));
    if (s.random) return (a, b) => (shuffleKey(seed, a.id) - shuffleKey(seed, b.id)) || tie(a, b);
    if (s.text) return (a, b) => ((collator ? collator.compare(s.value(a), s.value(b)) : s.value(a).localeCompare(s.value(b))) * order) || tie(a, b);
    return (a, b) => ((s.value(a) - s.value(b)) * order) || tie(a, b);
}

// What the direction button says for the current sort.
const dirLabel = (sortBy, order) => {
    const s = sortOf(sortBy);
    return s.dir ? s.dir[order === DESC ? 1 : 0] : '';
};

module.exports = { SORTS, sortOf, newSeed, comparator, dirLabel };
