// 18+ sources: hidden while the setting "Показывать 18+ контент" (ShowAdult) is
// off — the booru tabs and these online manga sites. The user's own library is
// never touched by it.
const ADULT_MANGA_SOURCES = new Set(['nhentai', 'ehentai', 'allhentai']);

const showAdult = (settings) => settings?.ShowAdult === true;
const isAdultMangaSource = (id) => ADULT_MANGA_SOURCES.has(String(id));

module.exports = { ADULT_MANGA_SOURCES, showAdult, isAdultMangaSource };
