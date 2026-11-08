import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {mangaApi} from '@/Infrastructure/Ipc';
import {appUrl, isWeb} from '@/Infrastructure/electron';
import {notify} from '@services/NotificationService';
import {mangaRequests, useCommands} from '@services/commands';
import {openManga} from './openManga';
import {readLibraryManga} from '@services/mangaLibrary';
import CollectionTreeSelect, {pushRecentCollection} from '@react/Library/Collection/CollectionTreeSelect';
import LibraryService from '@services/LibraryService';
import {onlineHistory} from './onlineHistory';
import {errText, loginTo, readOnline} from './onlineReader';
import SearchBar, {pushRecent, sameFilter} from './SearchBar';
import TagBrowser from './TagBrowser';
import {useMangaDownloads} from './useMangaDownloads';
import Settings from '@data/settings';
import {useConfigVersion} from '@services/liveConfig';
import {isAdultMangaSource, showAdult} from '@/shared/adult';

/**
 * Online manga: search on the sources, a gallery card, reading without saving,
 * the download queue, and "continue reading" for library and online manga.
 */
const PREFS_KEY = 'jsg_manga_view';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...p })); } catch { /* ignore */ } };

const SOURCE_ICON = { nhentai: 'bi-book-half', ehentai: 'bi-journals', allhentai: 'bi-bookmark-heart', hentai2read: 'bi-book-fill', mangadex: 'bi-book' };
const STATUS = {
    queued: { label: 'В очереди', icon: 'bi-hourglass-split' },
    running: { label: 'Загрузка', icon: 'bi-arrow-down-circle' },
    paused: { label: 'Пауза', icon: 'bi-pause-circle' },
    done: { label: 'Готово', icon: 'bi-check-circle-fill' },
    error: { label: 'Ошибка', icon: 'bi-exclamation-triangle-fill' },
    canceled: { label: 'Отменено', icon: 'bi-x-circle' },
};
const TAG_GROUPS = [
    ['artist', 'Авторы'], ['person', 'Авторы'], ['author', 'Авторы'], ['group', 'Группы'], ['parody', 'Пародии'],
    ['character', 'Персонажи'], ['language', 'Язык'], ['category', 'Категория'], ['female', 'Female'], ['male', 'Male'],
    ['mixed', 'Mixed'], ['other', 'Other'], ['cosplayer', 'Косплееры'], ['genre', 'Жанры'], ['theme', 'Темы'], ['format', 'Формат'], ['content', 'Контент'],
];

// Sites where a manga comes out chapter by chapter: subscriptions.
const multiSite = (source) => source === 'allhentai' || source === 'mangadex' || source === 'hentai2read';

const ago = (ms) => {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'только что';
    if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
    if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
    return `${Math.floor(s / 86400)} дн назад`;
};

const Cover = ({ src, className = '' }) => {
    const [state, setState] = useState('loading');
    return (
        <div className={`mo-cover ${className} ${state}`}>
            {src && state !== 'broken'
                ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false}
                       onLoad={() => setState('ready')} onError={() => setState('broken')} />
                : <i className="bi bi-book" />}
        </div>
    );
};

// "Download" with a collection picker; `chapters` — selected chapter ids or null (all).
const DownloadButton = ({ gallery, item, chapters = null, className = 'ftb-btn primary', label = 'Скачать', compact = false }) => {
    const [open, setOpen] = useState(false);
    const target = gallery || item;
    const start = async (collectionId) => {
        setOpen(false);
        if (collectionId) pushRecentCollection(collectionId);
        try {
            await mangaApi.download({ source: target.source, id: target.id, collectionId, chapters, title: target.title });
            const where = collectionId ? `«${LibraryService.getCollections().find(c => c.id === collectionId)?.name || 'коллекция'}»` : '«Без коллекции»';
            notify({ message: `В очереди загрузки → ${where}`, type: 'success', action: { label: 'Загрузки', onClick: () => openManga({ view: 'downloads' }) } });
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        }
    };
    return (
        <span className="mo-dl" onClick={e => e.stopPropagation()}>
            <button className={className} onClick={() => setOpen(v => !v)} title="Скачать в библиотеку (выбор коллекции)">
                <i className="bi bi-download" />{!compact && <span>{label}</span>}
            </button>
            {open && (
                <>
                    <div className="bulk-move-backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="bulk-move-panel mo-dl-panel">
                        <CollectionTreeSelect value={null} onSelect={start} onClose={() => setOpen(false)} />
                    </div>
                </>
            )}
        </span>
    );
};

// "Add to library" without downloading: chapters are read from the site, can be
// downloaded later; sites with chapters get a subscription at once.
const AddOnlineButton = ({ gallery, onAdded, className = 'ftb-btn', compact = false }) => {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const add = async (collectionId) => {
        setOpen(false);
        if (collectionId) pushRecentCollection(collectionId);
        setBusy(true);
        try {
            const r = await mangaApi.addOnline({ source: gallery.source, id: gallery.id, collectionId, subscribe: true });
            if (r.duplicate) notify({ message: r.duplicate, type: 'info' });
            else notify({ message: `В библиотеке (без скачивания)${r.subscribed ? ' · подписка на новые главы' : ''}`, type: 'success' });
            onAdded?.(r.item?.id || r.existingId);
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        } finally {
            setBusy(false);
        }
    };
    return (
        <span className="mo-dl" onClick={e => e.stopPropagation()}>
            <button className={className} disabled={busy} onClick={() => setOpen(v => !v)}
                    title="Добавить в библиотеку без скачивания: главы читаются с сайта, скачать можно потом">
                <i className={`bi ${busy ? 'bi-arrow-repeat spin' : 'bi-bookmark-plus'}`} />{!compact && <span>В библиотеку</span>}
            </button>
            {open && (
                <>
                    <div className="bulk-move-backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="bulk-move-panel mo-dl-panel">
                        <CollectionTreeSelect value={null} onSelect={add} onClose={() => setOpen(false)} />
                    </div>
                </>
            )}
        </span>
    );
};

// "Opened before" badge: from the online reading history.
const seenTitle = (e) => `Открывали ${ago(e.at)}${e.chapter != null ? ` · ${e.chapters > 1 && e.chapterTitle ? `${e.chapterTitle}, ` : ''}стр. ${(e.page || 0) + 1}` : ''}`;

const Card = React.memo(({ item, source, seen, onOpen, onRead }) => (
    <div className="mo-card" onClick={() => onOpen(item)} title={`${item.title}\nПКМ — сразу читать`}
         onContextMenu={e => { e.preventDefault(); onRead?.(item); }}>
        <Cover src={item.cover} />
        <div className="mo-card-badges">
            {seen && <span className="mo-badge seen" title={seenTitle(seen)}><i className="bi bi-eye-fill" /></span>}
            {item.inLibrary && <span className="mo-badge lib" title="Уже в библиотеке"><i className="bi bi-bookmark-check-fill" /></span>}
            {item.downloading && <span className="mo-badge dl" title={STATUS[item.downloading]?.label}><i className="bi bi-arrow-down-circle-fill" /></span>}
        </div>
        {!item.inLibrary && !item.downloading && (
            <div className="mo-card-quick">
                <DownloadButton item={{ id: item.id, title: item.title, source }} className="mo-quick-btn" compact />
            </div>
        )}
        <div className="mo-card-title">{item.title}</div>
        <div className="mo-card-meta">
            {item.pages ? <span>{item.pages} стр.</span> : null}
            {item.chapters ? <span>{item.chapters} гл.</span> : null}
            {item.language ? <span>{item.language}</span> : null}
            {item.category ? <span>{item.category}</span> : null}
            {item.rating != null ? <span><i className="bi bi-star-fill" /> {Number(item.rating).toFixed(1)}</span> : null}
        </div>
    </div>
));

const SearchPane = ({ source, onOpenGallery, onRead }) => {
    const [query, setQuery] = useState(() => loadPrefs().queries?.[source.id] || '');
    const [filters, setFilters] = useState(() => loadPrefs().filters?.[source.id] || []);
    const [sort, setSort] = useState(() => loadPrefs().sorts?.[source.id] || source.sorts?.[0]?.id || null);
    const [hideInLib, setHideInLib] = useState(() => !!loadPrefs().hideInLib);
    const [tagsOpen, setTagsOpen] = useState(false);
    const [history, setHistory] = useState(onlineHistory.list);
    useEffect(() => onlineHistory.subscribe(() => setHistory(onlineHistory.list())), []);
    const seenById = useMemo(() => new Map(history.filter(e => e.source === source.id).map(e => [String(e.id), e])), [history, source.id]);
    const [logged, setLogged] = useState(source.loggedIn ?? null);
    const [jump, setJump] = useState('');
    const [res, setRes] = useState({ items: [], loading: false, error: null, hasMore: false, first: 1, page: 0, pages: null, next: null, total: null });
    const reqId = useRef(0);
    const sentinel = useRef(null);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);
    const state = useRef({});
    state.current = { query, filters, sort, res };

    // q / f / s — overrides (a value just set isn't in the state yet); page — start
    // at that page; more — the next page under the loaded ones.
    const run = useCallback(async ({ q, f, s, more = false, page: startPage = 1 } = {}) => {
        const cur = state.current;
        q = q ?? cur.query; f = f ?? cur.filters; s = s ?? cur.sort;
        const id = ++reqId.current;
        setRes(r => ({ ...r, loading: true, error: null, ...(more ? {} : { items: [], page: 0, first: startPage, next: null }) }));
        if (!more) scrollRef.current?.scrollTo({ top: 0 });
        const p = loadPrefs();
        savePrefs({
            queries: { ...(p.queries || {}), [source.id]: q },
            filters: { ...(p.filters || {}), [source.id]: f },
            sorts: { ...(p.sorts || {}), [source.id]: s },
        });
        if (!more && (q.trim() || f.length)) pushRecent(source.id, q, f);
        try {
            const page = more ? cur.res.page + 1 : startPage;
            const r = await mangaApi.search({ source: source.id, query: q, filters: f, sort: s, page, next: more ? cur.res.next : null });
            if (id !== reqId.current) return;
            if (r.open) { setRes(x => ({ ...x, loading: false })); onOpenGallery(r.open); return; }
            setRes(x => {
                const seen = new Set(more ? x.items.map(i => i.id) : []);
                const fresh = (r.items || []).filter(i => !seen.has(i.id));
                return {
                    items: more ? [...x.items, ...fresh] : fresh, loading: false, error: null,
                    hasMore: !!r.hasMore && (r.items || []).length > 0,
                    first: more ? x.first : page, page, pages: r.pages ?? x.pages, next: r.next, total: r.total,
                };
            });
        } catch (e) {
            if (id !== reqId.current) return;
            setRes(x => ({ ...x, loading: false, error: errText(e) }));
        }
    }, [source.id, onOpenGallery]);

    useEffect(() => { run(); }, [source.id]);   // eslint-disable-line react-hooks/exhaustive-deps

    // Signed in or not (sites that need it).
    useEffect(() => {
        if (!source.login) return;
        let alive = true;
        mangaApi.loginState(source.id).then(v => { if (alive && v != null) setLogged(v); }).catch(() => {});
        return () => { alive = false; };
    }, [source.id, source.login]);
    const login = async () => {
        const ok = await loginTo(source.id);
        setLogged(ok || !!(await mangaApi.loginState(source.id).catch(() => null)));
    };

    // Endless scrolling: the next page comes when the end is near.
    useEffect(() => {
        const el = sentinel.current;
        if (!el) return;
        const io = new IntersectionObserver(([e]) => {
            const r = state.current.res;
            if (e.isIntersecting && r.hasMore && !r.loading && !r.error) run({ more: true });
        }, { root: scrollRef.current, rootMargin: '800px' });
        io.observe(el);
        return () => io.disconnect();
    }, [res.hasMore, res.loading, res.error, res.items.length, hideInLib, run]);

    // Marks change when a download finishes.
    useEffect(() => mangaApi.onDownloads(async () => {
        const ids = state.current.res.items.map(i => i.id);
        if (!ids.length) return;
        const lib = await mangaApi.inLibrary(source.id, ids).catch(() => null);
        if (lib) setRes(x => ({ ...x, items: x.items.map(i => (lib[i.id] && !i.inLibrary ? { ...i, inLibrary: lib[i.id], downloading: null } : i)) }));
    }), [source.id]);

    const openCard = useCallback((i) => onOpenGallery({ source: source.id, id: i.id, preview: i }), [onOpenGallery, source.id]);
    const readCard = useCallback((i) => onRead({ source: source.id, id: i.id }), [onRead, source.id]);
    const shown = useMemo(() => (hideInLib ? res.items.filter(i => !i.inLibrary) : res.items), [res.items, hideInLib]);
    const hidden = res.items.length - shown.length;

    // A tag from the tag panel.
    const addFilter = (f) => {
        const next = [...filters.filter(x => !sameFilter(x, f)), f];
        setFilters(next);
        run({ f: next });
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === '/' && !e.target.closest?.('input, textarea') && !document.querySelector('.rd')) { e.preventDefault(); inputRef.current?.focus(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const goPage = (n) => { if (n >= 1) { run({ page: res.pages ? Math.min(res.pages, n) : n }); setJump(''); } };
    const pageInfo = !res.page ? ''
        : source.cursor ? `загружено страниц: ${res.page - res.first + 1}`
        : `стр. ${res.first === res.page ? res.page : `${res.first}–${res.page}`}${res.pages ? ` из ${res.pages.toLocaleString('ru')}` : ''}`;

    return (
        <div className="mo-pane">
            <div className="folder-toolbar mo-toolbar">
                <SearchBar source={source} query={query} setQuery={setQuery} filters={filters} setFilters={setFilters}
                           onSearch={(o) => run(o)} onOpenGallery={onOpenGallery} inputRef={inputRef} />
                {source.tagGroups?.length > 0 && (
                    <button className={`ftb-btn ${tagsOpen ? 'on' : ''}`} onClick={() => setTagsOpen(v => !v)} title="Теги, пародии, персонажи, авторы…">
                        <i className="bi bi-tags" /> <span>Теги</span>
                    </button>
                )}
                {source.sorts?.length > 1 && (
                    <select className="form-select form-select-sm mo-sort" value={sort || ''} onChange={e => { setSort(e.target.value); run({ s: e.target.value }); }}>
                        {source.sorts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                )}
                <button className={`ftb-btn ${hideInLib ? 'on' : ''}`} title="Скрыть то, что уже есть в библиотеке"
                        onClick={() => { setHideInLib(v => !v); savePrefs({ hideInLib: !hideInLib }); }}>
                    <i className="bi bi-bookmark-x" />
                </button>
                <button className="ftb-btn" onClick={() => run({ page: res.first || 1 })} title="Обновить"><i className="bi bi-arrow-clockwise" /></button>
                {!isWeb && (
                    <button className="ftb-btn" onClick={() => mangaApi.openSite(source.id).then(() => run())} title="Открыть сайт в окне (проверка Cloudflare и т. п.)">
                        <i className="bi bi-globe2" />
                    </button>
                )}
                {source.login && isWeb && (
                    <span className={`ftb-btn ${logged ? 'mo-logged' : ''}`} title={logged ? 'На компьютере выполнен вход на сайт' : 'Вход на сайт — на компьютере: вкладка Manga → Войти'}>
                        <i className={`bi ${logged ? 'bi-person-check-fill' : 'bi-person-circle'}`} /> <span>{logged ? 'Вы вошли' : 'Вход — на ПК'}</span>
                    </span>
                )}
                {source.login && !isWeb && (
                    <button className={`ftb-btn ${logged ? 'mo-logged' : ''}`} onClick={login}
                            title={logged ? 'Вы вошли на сайт · открыть окно входа ещё раз' : 'Войти на сайте (нужно для чтения глав)'}>
                        <i className={`bi ${logged ? 'bi-person-check-fill' : 'bi-person-circle'}`} /> <span>{logged ? 'Вы вошли' : 'Войти'}</span>
                    </button>
                )}
            </div>
            <div className="mo-status">
                {res.total != null && <span>Найдено: {res.total.toLocaleString('ru')}</span>}
                {res.items.length > 0 && <span>· показано {shown.length}</span>}
                {pageInfo && <span>· {pageInfo}</span>}
                {hidden > 0 && <span>· скрыто из библиотеки: {hidden}</span>}
            </div>
            <div className="mo-body">
                <div className="mo-scroll" ref={scrollRef}>
                    {res.error && (
                        <div className="mo-error">
                            <i className="bi bi-exclamation-triangle" /> {res.error}
                            <button className="ftb-btn" onClick={() => run({ more: res.items.length > 0, page: res.first || 1 })}>Повторить</button>
                            {!isWeb && <button className="ftb-btn" onClick={() => mangaApi.openSite(source.id).then(() => run())}>Открыть сайт</button>}
                        </div>
                    )}
                    {res.first > 1 && !res.loading && (
                        <button className="ftb-btn mo-prev-page" onClick={() => goPage(res.first - 1)}><i className="bi bi-chevron-up" /> <span>Страница {res.first - 1}</span></button>
                    )}
                    <div className="mo-grid">
                        {shown.map(item => <Card key={item.id} item={item} source={source.id} seen={seenById.get(String(item.id))} onOpen={openCard} onRead={readCard} />)}
                        {res.loading && Array.from({ length: res.items.length ? 6 : 18 }, (_, i) => <div key={`s${i}`} className="mo-card skel"><div className="mo-cover" /></div>)}
                    </div>
                    {!res.loading && !res.error && !res.items.length && <div className="mo-empty">Ничего не найдено</div>}
                    <div ref={sentinel} className="mo-sentinel" />
                    {res.items.length > 0 && (
                        <div className="mo-pager">
                            {res.hasMore
                                ? (
                                    <button className="ftb-btn primary" disabled={res.loading} onClick={() => run({ more: true })}>
                                        <i className={`bi ${res.loading ? 'bi-arrow-repeat spin' : 'bi-chevron-down'}`} /> <span>Загрузить ещё</span>
                                    </button>
                                )
                                : !res.loading && <span className="mo-pager-end">Это всё</span>}
                            {!source.cursor && res.pages > 1 && (
                                <span className="mo-pager-jump">
                                    Страница
                                    <input type="number" min={1} max={res.pages} value={jump} placeholder={String(res.page)}
                                           onChange={e => setJump(e.target.value)}
                                           onKeyDown={e => { if (e.key === 'Enter') goPage(Number(jump)); }} />
                                    из {res.pages.toLocaleString('ru')}
                                    <button className="ftb-btn" disabled={!(Number(jump) >= 1)} onClick={() => goPage(Number(jump))}>Перейти</button>
                                </span>
                            )}
                        </div>
                    )}
                </div>
                {tagsOpen && <TagBrowser source={source} filters={filters} onAdd={addFilter} onClose={() => setTagsOpen(false)} />}
            </div>
        </div>
    );
};

const GalleryPane = ({ target, onBack, onSearchTag }) => {
    const [g, setG] = useState(null);
    const [error, setError] = useState(null);
    const [picked, setPicked] = useState(() => new Set());
    const [descOpen, setDescOpen] = useState(false);
    const [reload, setReload] = useState(0);
    const [, setHistoryVersion] = useState(0);
    useEffect(() => onlineHistory.subscribe(() => setHistoryVersion(n => n + 1)), []);
    const saved = onlineHistory.get(target.source, target.id);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        mangaApi.gallery(target.source, target.id)
            .then(r => { if (!cancelled) setG(r); })
            .catch(e => { if (!cancelled) setError(errText(e)); });
        return () => { cancelled = true; };
    }, [target.source, target.id, reload]);

    // Library mark / download state follow the queue.
    useEffect(() => mangaApi.onDownloads((list) => {
        const job = list.find(j => j.source === target.source && j.galleryId === String(target.id));
        if (!job) return;
        setG(x => (x ? { ...x, downloading: ['queued', 'running', 'paused'].includes(job.status) ? job.status : null, inLibrary: job.status === 'done' ? job.itemId : x.inLibrary, job } : x));
    }), [target.source, target.id]);

    // In the library already: chapters published since then, chapters not downloaded,
    // the subscription.
    const [fresh, setFresh] = useState(null);
    const [libBook, setLibBook] = useState(null);
    const [libVersion, setLibVersion] = useState(0);
    useEffect(() => {
        if (!g?.inLibrary) { setFresh(null); setLibBook(null); return; }
        let cancelled = false;
        mangaApi.book(g.inLibrary).then(b => { if (!cancelled) setLibBook(b); }).catch(() => {});
        if ((g.chapters?.length || 0) >= 2) mangaApi.newChapters(g.inLibrary).then(r => { if (!cancelled) setFresh(r.chapters); }).catch(() => {});
        return () => { cancelled = true; };
    }, [g?.inLibrary, g?.chapters?.length, libVersion]);
    const libRemote = libBook ? libBook.chapters.filter(c => c.remote).length : 0;
    const sub = libBook?.subscription?.on ? libBook.subscription : null;
    const canSubscribe = g?.inLibrary && multiSite(target.source);
    // New chapters: added to the library manga as online ones (read at once, download later).
    const addFresh = async () => {
        try {
            const r = await mangaApi.checkUpdates(g.inLibrary);
            setFresh(null);
            setLibVersion(n => n + 1);
            notify({ message: `Новые главы (${r.added.length}) в библиотеке${r.queued ? ' — в очереди загрузки' : ' — читаются онлайн'}`, type: 'success' });
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        }
    };
    const downloadRemote = async () => {
        try {
            await mangaApi.downloadRemote(g.inLibrary);
            notify({ message: `Онлайн-главы (${libRemote}) в очереди — допишутся в мангу из библиотеки`, type: 'success' });
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        }
    };
    const toggleSub = async () => {
        try {
            await mangaApi.setSubscription(g.inLibrary, !sub);
            setLibVersion(n => n + 1);
            notify({ message: sub ? 'Подписка отменена' : 'Подписка оформлена — новые главы будут появляться сами', type: 'success' });
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        }
    };

    const preview = target.preview;
    const title = g?.title || preview?.title || '…';
    const multi = (g?.chapters?.length || 0) > 1;
    const single = g && !multi ? g.chapters[0] : null;
    const read = (start = null) => readOnline(g, {
        start,
        onDownload: g.inLibrary || g.downloading || !g.chapters.length ? null : async () => {
            try {
                await mangaApi.download({ source: target.source, id: target.id, collectionId: null, title: g.title });
                notify({ message: 'В очереди загрузки → «Без коллекции»', type: 'success' });
            } catch (e) {
                notify({ message: errText(e), type: 'warning' });
            }
        },
    });
    const tagGroups = useMemo(() => {
        const map = new Map();
        (g?.tags || []).forEach(t => {
            const label = TAG_GROUPS.find(([k]) => k === t.type)?.[1] || 'Теги';
            if (!map.has(label)) map.set(label, []);
            map.get(label).push(t);
        });
        return [...map.entries()];
    }, [g]);

    const toggle = (id) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    return (
        <div className="mo-pane">
            <div className="folder-toolbar mo-toolbar">
                <button className="ftb-btn" onClick={onBack} title="Назад (Esc)"><i className="bi bi-arrow-left" /> <span>Назад</span></button>
                <div className="mo-crumb">{title}</div>
                {g?.url && <button className="ftb-btn" onClick={() => (isWeb ? window.open(g.url, '_blank', 'noopener') : mangaApi.openSite(target.source, g.url))} title="Открыть на сайте"><i className="bi bi-box-arrow-up-right" /></button>}
            </div>
            <div className="mo-scroll">
                {error && !g && (
                    <div className="mo-error">
                        <i className="bi bi-exclamation-triangle" /> {error}
                        <button className="ftb-btn" onClick={() => setReload(n => n + 1)}>Повторить</button>
                    </div>
                )}
                <div className="mo-detail">
                    <Cover src={g?.cover || preview?.cover} className="big" />
                    <div className="mo-info">
                        <h2 className="mo-title">{title}</h2>
                        {g?.altTitle && g.altTitle !== title && <div className="mo-alt">{g.altTitle}</div>}
                        <div className="mo-chips">
                            {g?.pages ? <span className="mo-chip"><i className="bi bi-file-earmark-image" /> {g.pages} стр.</span> : null}
                            {multi ? <span className="mo-chip"><i className="bi bi-list-ol" /> {g.chapters.length} гл.</span> : null}
                            {g?.language && <span className="mo-chip"><i className="bi bi-translate" /> {g.language}</span>}
                            {g?.category && <span className="mo-chip">{g.category}</span>}
                            {g?.rating ? <span className="mo-chip"><i className="bi bi-star-fill" /> {Number(g.rating).toFixed(2)}</span> : null}
                            {g?.favorites ? <span className="mo-chip"><i className="bi bi-heart-fill" /> {g.favorites}</span> : null}
                            {g?.uploaded ? <span className="mo-chip"><i className="bi bi-calendar3" /> {new Date(g.uploaded * 1000).toLocaleDateString('ru')}</span> : null}
                        </div>
                        <div className="mo-actions">
                            <button className="ftb-btn primary" disabled={!g || !g.chapters.length} onClick={() => read()}>
                                <i className="bi bi-book" />
                                <span>{saved?.chapter ? `Продолжить${multi && saved.chapterTitle ? ` · ${saved.chapterTitle}` : ''} · с. ${(saved.page || 0) + 1}` : 'Читать онлайн'}</span>
                            </button>
                            {saved?.chapter && <button className="ftb-btn" disabled={!g} onClick={() => read({ chapter: g.chapters[0].id, page: 0 })}>С начала</button>}
                            {g?.inLibrary ? (<>
                                <button className="ftb-btn mo-inlib" onClick={() => readLibraryManga({ id: g.inLibrary, title, sourceUrl: g.url })}>
                                    <i className="bi bi-bookmark-check-fill" /> <span>В библиотеке · читать</span>
                                </button>
                                {libRemote > 0 && (
                                    <button className="ftb-btn" onClick={downloadRemote} title="Главы в библиотеке, которые пока читаются с сайта">
                                        <i className="bi bi-download" /> <span>Скачать {libRemote === libBook.chapters.length ? 'всё' : `онлайн-главы: ${libRemote}`}</span>
                                    </button>
                                )}
                                {canSubscribe && (
                                    <button className={`ftb-btn ${sub ? 'mo-sub-on' : ''}`} onClick={toggleSub}
                                            title={sub ? 'Новые главы проверяются сами. Нажмите, чтобы отписаться' : 'Новые главы будут появляться в библиотеке сами'}>
                                        <i className={`bi ${sub ? 'bi-bell-fill' : 'bi-bell'}`} /> <span>{sub ? 'Подписка' : 'Подписаться'}</span>
                                    </button>
                                )}
                            </>) : g?.downloading ? (
                                <button className="ftb-btn" onClick={() => mangaRequests.request({ view: 'downloads' })}>
                                    <i className="bi bi-arrow-down-circle" /> <span>{STATUS[g.downloading]?.label}{g.job?.total ? ` · ${g.job.done}/${g.job.total}` : ''}</span>
                                </button>
                            ) : g?.chapters.length > 0 && (<>
                                <DownloadButton gallery={g} chapters={picked.size ? [...picked] : null}
                                                label={picked.size ? `Скачать выбранные (${picked.size})` : 'Скачать'} />
                                <AddOnlineButton gallery={g} onAdded={(itemId) => itemId && setG(x => ({ ...x, inLibrary: itemId }))} />
                            </>)}
                            {fresh?.length > 0 && (
                                <button className="ftb-btn primary" onClick={addFresh} title="Добавить в мангу из библиотеки главы, которых в ней нет (читаются онлайн, скачать можно потом)">
                                    <i className="bi bi-plus-circle" /> <span>Новые главы: {fresh.length}</span>
                                </button>
                            )}
                            {g?.login && !isWeb && (
                                <button className="ftb-btn" title="Главы этого сайта видны только после входа — окно сайта, войдите в свой аккаунт"
                                        onClick={() => loginTo(target.source)}>
                                    <i className="bi bi-person-circle" /> <span>Войти на сайте</span>
                                </button>
                            )}
                            {g && (
                                <button className="ftb-btn" title="Скопировать ссылку" onClick={() => navigator.clipboard?.writeText(g.url).then(() => notify({ message: 'Ссылка скопирована', type: 'info' }))}>
                                    <i className="bi bi-link-45deg" />
                                </button>
                            )}
                        </div>
                        {g?.description && (
                            <div className={`mo-desc ${descOpen ? 'open' : ''}`} onClick={() => setDescOpen(v => !v)}>{g.description}</div>
                        )}
                        {tagGroups.map(([label, tags]) => (
                            <div className="mo-tags" key={label}>
                                <span className="mo-tags-label">{label}</span>
                                {tags.map(t => (
                                    <button key={`${t.type}:${t.name}`} className="mo-tag" title="Искать с этим тегом · ПКМ — без него"
                                            onClick={() => onSearchTag({ type: t.type, name: t.name, id: t.id ?? null, exclude: false })}
                                            onContextMenu={e => { e.preventDefault(); onSearchTag({ type: t.type, name: t.name, id: t.id ?? null, exclude: true }); }}>{t.name}</button>
                                ))}
                            </div>
                        ))}
                        {!g && !error && <div className="mo-loading"><i className="bi bi-arrow-repeat spin" /> Загрузка…</div>}
                        {g && !g.chapters.length && (
                            <div className="mo-error"><i className="bi bi-info-circle" /> Читать нечего: на сайте нет загруженных глав{target.source === 'mangadex' ? ' на русском или английском' : ''}.</div>
                        )}
                    </div>
                </div>

                {multi && (
                    <div className="mo-chapters">
                        <div className="mo-section-head">
                            <span>Главы</span>
                            <button className="ftb-btn" onClick={() => setPicked(picked.size === g.chapters.length ? new Set() : new Set(g.chapters.map(c => c.id)))}>
                                {picked.size === g.chapters.length ? 'Снять выбор' : 'Выбрать все'}
                            </button>
                        </div>
                        {g.chapters.map((c, i) => (
                            <div key={c.id} className={`mo-chapter ${saved?.chapter === c.id ? 'current' : ''} ${picked.has(c.id) ? 'picked' : ''}`}
                                 onClick={() => read({ chapter: c.id, page: 0 })}>
                                <button className="mo-chapter-check" title="Выбрать для загрузки" onClick={e => { e.stopPropagation(); toggle(c.id); }}>
                                    <i className={`bi ${picked.has(c.id) ? 'bi-check-square-fill' : 'bi-square'}`} />
                                </button>
                                <span className="mo-chapter-num">{i + 1}</span>
                                <span className="mo-chapter-title">{c.title}</span>
                                {saved?.chapter === c.id && <span className="mo-chapter-here">читаю · с. {(saved.page || 0) + 1}</span>}
                            </div>
                        ))}
                    </div>
                )}

                {single?.pages?.length > 0 && (
                    <div className="mo-pages">
                        <div className="mo-section-head"><span>Страницы</span></div>
                        <div className="mo-thumbs">
                            {single.pages.map((p, i) => (
                                <button key={i} className="mo-thumb" onClick={() => read({ chapter: single.id, page: i })} title={`Страница ${i + 1}`}>
                                    <img src={p.thumb || p.url} alt="" loading="lazy" decoding="async" draggable={false} />
                                    <span>{i + 1}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const DownloadsPane = ({ jobs, onOpenGallery }) => {
    const act = (id, action) => mangaApi.downloadAction(id, action).catch(e => notify({ message: errText(e), type: 'warning' }));
    const finished = jobs.filter(j => j.status === 'done' || j.status === 'canceled').length;
    return (
        <div className="mo-pane">
            <div className="folder-toolbar mo-toolbar">
                <div className="mo-crumb"><i className="bi bi-download" /> Загрузки</div>
                <button className="ftb-btn" disabled={!finished} onClick={() => mangaApi.clearDownloads()} title="Убрать завершённые и отменённые из списка">
                    <i className="bi bi-trash3" /> <span>Очистить готовые</span>
                </button>
            </div>
            <div className="mo-scroll">
                {!jobs.length && (
                    <div className="mo-empty">
                        Очередь пуста. Скачать мангу: кнопка «Скачать» в карточке, Ctrl+V ссылки на галерею в библиотеке или расширение браузера.
                    </div>
                )}
                <div className="mo-jobs">
                    {jobs.map(j => {
                        const st = STATUS[j.status] || STATUS.queued;
                        const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
                        return (
                            <div key={j.id} className={`mo-job ${j.status}`}>
                                <div className="mo-job-cover" onClick={() => onOpenGallery({ source: j.source, id: j.galleryId })}>
                                    <Cover src={j.cover ? appUrl(`mangaimg://p/?s=${encodeURIComponent(j.source)}&u=${encodeURIComponent(j.cover)}`) : null} />
                                </div>
                                <div className="mo-job-body">
                                    <div className="mo-job-title" onClick={() => onOpenGallery({ source: j.source, id: j.galleryId })}>{j.title || j.url || j.galleryId}</div>
                                    <div className="mo-job-meta">
                                        <span className={`mo-job-status ${j.status}`}><i className={`bi ${st.icon}`} /> {st.label}</span>
                                        <span>{j.source}</span>
                                        {j.total > 0 && <span>{j.done} / {j.total} стр.</span>}
                                        {j.updatedAt && <span>{ago(j.updatedAt * 1000)}</span>}
                                    </div>
                                    {(j.status === 'running' || j.status === 'paused' || (j.status === 'queued' && j.done > 0)) && (
                                        <div className="mo-progress"><span style={{ width: `${pct}%` }} /></div>
                                    )}
                                    {j.error && <div className={`mo-job-error ${j.status === 'done' ? 'soft' : ''}`}>{j.error}</div>}
                                </div>
                                <div className="mo-job-actions">
                                    {j.status === 'done' && j.itemId && (
                                        <button className="ftb-btn primary" onClick={() => readLibraryManga({ id: j.itemId, title: j.title })}><i className="bi bi-book" /> <span>Читать</span></button>
                                    )}
                                    {(j.status === 'running' || j.status === 'queued') && <button className="ftb-btn" title="Пауза" onClick={() => act(j.id, 'pause')}><i className="bi bi-pause-fill" /></button>}
                                    {j.status === 'paused' && <button className="ftb-btn" title="Продолжить" onClick={() => act(j.id, 'resume')}><i className="bi bi-play-fill" /></button>}
                                    {(j.status === 'error' || j.status === 'canceled') && <button className="ftb-btn" title="Повторить" onClick={() => act(j.id, 'retry')}><i className="bi bi-arrow-clockwise" /></button>}
                                    {['running', 'queued', 'paused'].includes(j.status) && <button className="ftb-btn danger" title="Отменить" onClick={() => act(j.id, 'cancel')}><i className="bi bi-x-lg" /></button>}
                                    {!['running'].includes(j.status) && <button className="ftb-btn danger" title="Убрать из списка" onClick={() => act(j.id, 'remove')}><i className="bi bi-trash3" /></button>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const RecentPane = ({ onOpenGallery, onRead }) => {
    const [lib, setLib] = useState(null);
    const [online, setOnline] = useState(onlineHistory.list);
    // 18+ off: what was read on those sites isn't listed either.
    useConfigVersion();
    const visibleOnline = showAdult(Settings) ? online : online.filter(e => !isAdultMangaSource(e.source));
    useEffect(() => { mangaApi.recent(40).then(setLib).catch(() => setLib([])); }, []);
    useEffect(() => onlineHistory.subscribe(() => setOnline(onlineHistory.list())), []);

    return (
        <div className="mo-pane">
            <div className="folder-toolbar mo-toolbar">
                <div className="mo-crumb"><i className="bi bi-clock-history" /> Продолжить чтение</div>
                {visibleOnline.length > 0 && (
                    <button className="ftb-btn" onClick={() => { if (window.confirm('Очистить историю онлайн-чтения?')) onlineHistory.clear(); }}>
                        <i className="bi bi-trash3" /> <span>Очистить онлайн-историю</span>
                    </button>
                )}
            </div>
            <div className="mo-scroll">
                <div className="mo-section-head"><span>В библиотеке</span></div>
                {lib && !lib.length && <div className="mo-empty small">Начатой манги в библиотеке нет</div>}
                <div className="mo-grid">
                    {(lib || []).map(it => (
                        <div key={it.id} className="mo-card" onClick={() => readLibraryManga(it)} onContextMenu={e => { e.preventDefault(); readLibraryManga(it); }} title={it.title}>
                            <Cover src={it.thumbPath} />
                            <div className="mo-card-title">{it.title}</div>
                            <div className="mo-card-meta">
                                <span>с. {(it.readPosition || 0) + 1} / {it.pageCount || '?'}</span>
                                {it.readAt ? <span>{ago(it.readAt * 1000)}</span> : null}
                            </div>
                            {it.pageCount > 0 && <div className="mo-card-bar"><span style={{ width: `${Math.min(100, ((it.readPosition + 1) / it.pageCount) * 100)}%` }} /></div>}
                        </div>
                    ))}
                </div>
                <div className="mo-section-head"><span>Онлайн</span></div>
                {!visibleOnline.length && <div className="mo-empty small">Здесь появится то, что вы читали онлайн</div>}
                <div className="mo-grid">
                    {visibleOnline.map(e => (
                        <div key={e.key} className="mo-card" onClick={() => onOpenGallery({ source: e.source, id: e.id, preview: { title: e.title, cover: e.cover } })}
                             onContextMenu={ev => { ev.preventDefault(); onRead({ source: e.source, id: e.id }); }} title={`${e.title}
ПКМ — продолжить чтение`}>
                            <Cover src={e.cover} />
                            <button className="mo-card-remove" title="Убрать из истории" onClick={ev => { ev.stopPropagation(); onlineHistory.remove(e.key); }}>
                                <i className="bi bi-x" />
                            </button>
                            <div className="mo-card-title">{e.title}</div>
                            <div className="mo-card-meta">
                                <span>{e.source}</span>
                                {e.chapter != null && <span>{e.chapters > 1 && e.chapterTitle ? `${e.chapterTitle} · ` : ''}с. {(e.page || 0) + 1}</span>}
                                <span>{ago(e.at)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const HOURS = [[0, 'вручную'], [1, 'каждый час'], [3, 'каждые 3 ч'], [6, 'каждые 6 ч'], [12, 'каждые 12 ч'], [24, 'раз в день']];

// Live state of the subscriptions: the list, the schedule, a check in progress.
export function useMangaSubs() {
    const [subs, setSubs] = useState(null);
    const [config, setConfig] = useState(null);
    const [progress, setProgress] = useState(null);   // { done, total } while checking
    const load = useCallback(() => {
        mangaApi.subscriptions().then(setSubs).catch(() => setSubs([]));
        mangaApi.subsConfig().then(c => { setConfig(c); if (c.running) setProgress(c.running); }).catch(() => {});
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => mangaApi.onSubs((p) => { setProgress(p.running ? { done: p.done, total: p.total } : null); if (!p.running) load(); }), [load]);
    useEffect(() => {
        let t = null;
        const reload = () => { clearTimeout(t); t = setTimeout(load, 400); };
        window.addEventListener('df:libraryReload', reload);
        const off = LibraryService.onLibraryChanged?.(reload);
        return () => { clearTimeout(t); window.removeEventListener('df:libraryReload', reload); off?.(); };
    }, [load]);
    return { subs, config, setConfig, progress, load };
}

const SubsPane = ({ state, onOpenGallery }) => {
    const { subs, config, setConfig, progress, load } = state;
    const [busyId, setBusyId] = useState(null);
    useEffect(() => { load(); }, [load]);
    const checkAll = async () => {
        try {
            const r = await mangaApi.checkUpdates();
            if (r.busy) return;
            const n = r.items.reduce((a, i) => a + i.added, 0);
            notify(n
                ? { message: `Новых глав: ${n} (${r.items.map(i => `«${i.title}» +${i.added}`).slice(0, 3).join(', ')}${r.items.length > 3 ? '…' : ''})`, type: 'success', duration: 8000 }
                : { message: r.errors.length ? `Новых глав нет · не удалось проверить: ${r.errors.length}` : 'Новых глав нет', type: r.errors.length ? 'warning' : 'info' });
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        }
    };
    const checkOne = async (s) => {
        setBusyId(s.id);
        try {
            const r = await mangaApi.checkUpdates(s.id);
            notify(r.added.length ? { message: `«${s.title}»: новых глав ${r.added.length}`, type: 'success' } : { message: `«${s.title}»: новых глав нет`, type: 'info' });
        } catch (e) {
            notify({ message: `«${s.title}»: ${errText(e)}`, type: 'warning' });
        } finally {
            setBusyId(null);
            load();
        }
    };
    const unsubscribe = async (s) => {
        await mangaApi.setSubscription(s.id, false).catch(e => notify({ message: errText(e), type: 'warning' }));
        load();
    };
    const downloadRemote = async (s) => {
        try {
            await mangaApi.downloadRemote(s.id);
            notify({ message: `«${s.title}»: онлайн-главы (${s.remote}) в очереди загрузки`, type: 'success' });
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        }
    };
    const setCfg = (patch) => mangaApi.setSubsConfig(patch).then(setConfig).catch(e => notify({ message: errText(e), type: 'warning' }));

    return (
        <div className="mo-pane">
            <div className="folder-toolbar mo-toolbar">
                <div className="mo-crumb"><i className="bi bi-bell" /> Подписки</div>
                <button className="ftb-btn primary" disabled={!!progress || !subs?.length} onClick={checkAll} title="Спросить сайты о новых главах сейчас">
                    <i className={`bi bi-arrow-repeat ${progress ? 'spin' : ''}`} />
                    <span>{progress ? `Проверка… ${progress.done}/${progress.total}` : 'Проверить обновления'}</span>
                </button>
            </div>
            <div className="mo-scroll">
                {config && !isWeb && (
                    <div className="mo-subs-config">
                        <label>
                            <span>Проверять</span>
                            <select value={config.hours} onChange={e => setCfg({ hours: Number(e.target.value) })}>
                                {HOURS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
                            </select>
                        </label>
                        <label title="Без этого новые главы появляются в библиотеке онлайн: читаются сразу, скачать можно потом">
                            <input type="checkbox" checked={config.autoDownload} onChange={e => setCfg({ autoDownload: e.target.checked })} />
                            <span>Сразу скачивать новые главы</span>
                        </label>
                        {config.lastRun > 0 && <span className="mo-subs-last">последняя проверка: {ago(config.lastRun * 1000)}</span>}
                    </div>
                )}
                {subs && !subs.length && (
                    <div className="mo-empty">
                        Подписок пока нет. Откройте мангу с AllHentai или MangaDex и нажмите «В библиотеку» (без скачивания) или «Подписаться» —
                        новые главы будут появляться в библиотеке сами.
                    </div>
                )}
                <div className="mo-subs">
                    {(subs || []).map(s => (
                        <div key={s.id} className={`mo-sub ${s.unseen ? 'fresh' : ''}`}>
                            <div className="mo-sub-cover" onClick={() => readLibraryManga({ id: s.id, title: s.title })} title="Читать">
                                <Cover src={s.thumbPath} />
                                {s.unseen > 0 && <span className="mo-sub-new">+{s.unseen}</span>}
                            </div>
                            <div className="mo-sub-body">
                                <div className="mo-sub-title" onClick={() => readLibraryManga({ id: s.id, title: s.title })}>{s.title}</div>
                                <div className="mo-sub-meta">
                                    <span><i className={`bi ${SOURCE_ICON[s.site] || 'bi-globe'}`} /> {s.site}</span>
                                    <span>{s.chapters} гл.{s.remote ? ` · онлайн: ${s.remote}` : ''}</span>
                                    {s.unseen > 0 && <span className="new">новых: {s.unseen}</span>}
                                    <span>{s.checkedAt ? `проверено ${ago(s.checkedAt * 1000)}` : 'ещё не проверялась'}</span>
                                </div>
                                {s.error && <div className="mo-sub-error" title={s.error}><i className="bi bi-exclamation-triangle" /> {s.error}</div>}
                            </div>
                            <div className="mo-sub-actions">
                                <button className="ftb-btn" title="Читать" onClick={() => readLibraryManga({ id: s.id, title: s.title })}><i className="bi bi-book" /></button>
                                <button className="ftb-btn" title="Проверить эту" disabled={busyId === s.id || !!progress} onClick={() => checkOne(s)}>
                                    <i className={`bi bi-arrow-repeat ${busyId === s.id ? 'spin' : ''}`} />
                                </button>
                                {s.remote > 0 && <button className="ftb-btn" title={`Скачать онлайн-главы (${s.remote})`} onClick={() => downloadRemote(s)}><i className="bi bi-download" /></button>}
                                {s.site && s.galleryId && <button className="ftb-btn" title="Карточка на сайте" onClick={() => onOpenGallery({ source: s.site, id: s.galleryId, preview: { title: s.title } })}><i className="bi bi-globe2" /></button>}
                                <button className="ftb-btn" title="Отписаться" onClick={() => unsubscribe(s)}><i className="bi bi-bell-slash" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MangaView = () => {
    const [allSources, setSources] = useState([]);
    // 18+ off: only the sites without adult content (MangaDex).
    useConfigVersion();
    const adult = showAdult(Settings);
    const sources = adult ? allSources : allSources.filter(s => !s.adult);
    const [view, setView] = useState(() => loadPrefs().view || 'search');
    const [sourceId, setSourceId] = useState(() => loadPrefs().source || 'mangadex');
    const [gallery, setGallery] = useState(null);       // { source, id, preview }
    const [searchKey, setSearchKey] = useState(0);
    const jobs = useMangaDownloads();
    const active = jobs.filter(j => ['queued', 'running', 'paused'].includes(j.status)).length;
    const subsState = useMangaSubs();
    const unseen = (subsState.subs || []).reduce((n, s) => n + (s.unseen || 0), 0);

    useEffect(() => { mangaApi.sources().then(setSources).catch(e => notify({ message: errText(e), type: 'warning' })); }, []);
    useEffect(() => savePrefs({ view: view === 'gallery' ? 'search' : view, source: sourceId }), [view, sourceId]);

    const source = sources.find(s => s.id === sourceId) || sources[0];
    const openGallery = useCallback((g) => {
        if (!showAdult(Settings) && isAdultMangaSource(g?.source)) {
            notify({ message: 'Этот сайт скрыт: включите «Показывать 18+ контент» в настройках', type: 'info' });
            return;
        }
        setGallery(g);
        setView('gallery');
    }, []);
    const openFromSearch = useCallback((g) => openGallery({ ...g, from: 'search' }), [openGallery]);
    // Right click on a card: straight into the reader.
    const quickRead = useCallback(async ({ source: src, id }) => {
        try {
            const g = await mangaApi.gallery(src, id);
            readOnline(g);
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        }
    }, []);
    const back = useCallback(() => setView(v => (v === 'gallery' ? (gallery?.from || 'search') : v)), [gallery]);

    // Requests from elsewhere: "downloads" in a notice, a gallery link, …
    useEffect(() => {
        const handle = (r) => {
            if (!r) return;
            if (r.view === 'downloads') setView('downloads');
            else if (r.view === 'recent') setView('recent');
            else if (r.view === 'subs') setView('subs');
            else if (r.open) openGallery({ ...r.open, from: view });
        };
        handle(mangaRequests.take());
        return mangaRequests.subscribe(handle);
    }, [openGallery, view]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape' && view === 'gallery' && !e.target.closest?.('input, textarea') && !document.querySelector('.rd')) back();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [view, back]);

    // A tag of a gallery card → added to that site's current search (same tag again
    // just flips include / exclude), and the search runs.
    const searchTag = (f) => {
        const p = loadPrefs();
        const cur = p.filters?.[gallery.source] || [];
        const next = [...cur.filter(x => !sameFilter(x, f)), f];
        savePrefs({ filters: { ...(p.filters || {}), [gallery.source]: next } });
        setSourceId(gallery.source);
        setSearchKey(k => k + 1);
        setView('search');
    };

    useCommands('manga', () => [
        ...sources.map(s => ({ id: `manga:src:${s.id}`, group: 'Манга', icon: SOURCE_ICON[s.id] || 'bi-globe', title: `Манга: поиск на ${s.name}`, run: () => { setSourceId(s.id); setView('search'); } })),
    ]);

    return (
        <div className="folder-layout mo-layout">
            <aside className="fsb">
                <div className="fsb-section">
                    <div className="fsb-title">Источники</div>
                    {sources.map(s => (
                        <div key={s.id} className={`fsb-item ${view === 'search' && source?.id === s.id ? 'active' : ''}`}
                             onClick={() => { setSourceId(s.id); setView('search'); }}>
                            <i className={`bi ${SOURCE_ICON[s.id] || 'bi-globe'}`} />
                            <span className="fsb-label">{s.name}</span>
                            {s.login && <i className="bi bi-person-lock mo-src-lock" title="Чтение глав — после входа на сайте" />}
                        </div>
                    ))}
                </div>
                <div className="fsb-section">
                    <div className="fsb-title">Моё</div>
                    <div className={`fsb-item ${view === 'recent' ? 'active' : ''}`} onClick={() => setView('recent')}>
                        <i className="bi bi-clock-history" /><span className="fsb-label">Продолжить чтение</span>
                    </div>
                    <div className={`fsb-item ${view === 'subs' ? 'active' : ''}`} onClick={() => setView('subs')}>
                        <i className="bi bi-bell" /><span className="fsb-label">Подписки</span>
                        {subsState.progress ? <i className="bi bi-arrow-repeat spin mo-count-spin" />
                            : unseen > 0 ? <span className="mo-count new" title="Новых глав">+{unseen}</span>
                            : subsState.subs?.length > 0 && <span className="mo-count muted">{subsState.subs.length}</span>}
                    </div>
                    <div className={`fsb-item ${view === 'downloads' ? 'active' : ''}`} onClick={() => setView('downloads')}>
                        <i className="bi bi-download" /><span className="fsb-label">Загрузки</span>
                        {active > 0 && <span className="mo-count">{active}</span>}
                    </div>
                </div>
                <div className="fsb-section">
                    <div className="fsb-title">Подсказки</div>
                    <div className="fsb-empty mo-tips">
                        Вставьте ссылку на галерею в поиск — откроется карточка. Ctrl+V ссылки в библиотеке ставит её на загрузку.
                    </div>
                    <div className="fsb-item" onClick={() => mangaApi.clearCache().then(() => notify({ message: 'Кэш страниц очищен', type: 'info' }))}>
                        <i className="bi bi-eraser" /><span className="fsb-label">Очистить кэш страниц</span>
                    </div>
                </div>
            </aside>

            <div className="folder-main">
                {/* The search stays mounted under the card: results and scroll survive "back". */}
                {source && (
                    <div className={`mo-keep ${view === 'search' ? '' : 'hidden'}`}>
                        <SearchPane key={`${source.id}:${searchKey}`} source={source} onOpenGallery={openFromSearch} onRead={quickRead} />
                    </div>
                )}
                {view === 'gallery' && gallery ? (
                    <GalleryPane key={`${gallery.source}:${gallery.id}`} target={gallery} onBack={back} onSearchTag={searchTag} />
                ) : view === 'downloads' ? (
                    <DownloadsPane jobs={jobs} onOpenGallery={(g) => openGallery({ ...g, from: 'downloads' })} />
                ) : view === 'subs' ? (
                    <SubsPane state={subsState} onOpenGallery={(g) => openGallery({ ...g, from: 'subs' })} />
                ) : view === 'recent' ? (
                    <RecentPane onOpenGallery={(g) => openGallery({ ...g, from: 'recent' })} onRead={quickRead} />
                ) : !source ? (
                    <div className="mo-empty">Загрузка источников…</div>
                ) : null}
            </div>
        </div>
    );
};

export default MangaView;
