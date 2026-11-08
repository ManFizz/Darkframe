import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import PrivateData from '@data/private';
import {DRAG_PATHS, fsApi, fsThumbUrl, libraryApi} from '@/Infrastructure/Ipc';
import {SOURCE_TYPES} from '@/Constants';
import FsDialog from './FsDialog';
import {mangaApi} from '@/Infrastructure/Ipc';
import {readLibraryManga} from '@services/mangaLibrary';
import MakeMangaButton from '@react/Manga/MakeMangaButton';
import {folderRequests, useCommands} from '@services/commands';
import {ipcRenderer} from '@/Infrastructure/electron';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import Modal from '@react/Modal/Modal';
import FolderTile from '@react/Common/FolderTile';
import CollectionTreeSelect, {pushRecentCollection} from '@react/Library/Collection/CollectionTreeSelect';
import FolderSidebar from './FolderSidebar';
import PathBar from './PathBar';
import {useFolderBrowser} from './useFolderBrowser';
import {isPinned, setFolderPrefs, togglePin, useFolderPrefs} from './folderPrefs';
import {getViewPrefs} from '@services/viewPrefs';
import {useHoverVideo} from '@react/Thumb/useHoverVideo';
import {nodePath, sys} from '@/Infrastructure/electron';
import {matches} from '@services/keymap';


const CHUNK = 240;

const KINDS = [
    { id: 'all',   label: 'Все',         icon: 'bi-grid' },
    { id: 'image', label: 'Изображения', icon: 'bi-image' },
    { id: 'video', label: 'Видео',       icon: 'bi-play-btn' },
    { id: 'gif',   label: 'GIF',         icon: 'bi-filetype-gif' },
];

const SORTS = [
    { id: 'name',  label: 'Имя' },
    { id: 'mtime', label: 'Дата изменения' },
    { id: 'size',  label: 'Размер' },
    { id: 'type',  label: 'Тип' },
];

export const fmtSize = (b) => {
    if (b == null) return '—';
    if (b < 1024) return `${b} Б`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} КБ`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} МБ`;
    return `${(b / 1024 ** 3).toFixed(2)} ГБ`;
};

const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
};
export const filesWord = (n) => `${n} ${plural(n, 'файл', 'файла', 'файлов')}`;

const cmpName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

const FileTile = React.memo(({ file, onOpen, selected, selecting, onToggle, onDragStart, lib, seen }) => {
    const [loaded, setLoaded] = useState(false);
    const [broken, setBroken] = useState(false);
    const t = file.thumb;
    // Folder thumbnails take the frame at 10%, at most 30 s in (fsThumbs).
    const hover = useHoverVideo(file.kind === 'video' ? t.contentUrl : null, { cap: 30 });
    // Plain click opens; Ctrl / Shift click (or the checkbox) select — like Explorer.
    const onClick = (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); onToggle(file, e); }
        else onOpen(t);
    };
    return (
        <div className={`ftfile ${selected ? 'selected' : ''} ${selecting ? 'selecting' : ''}`}
             onClick={onClick} onContextMenu={e => { e.preventDefault(); onOpen(t); }} title={file.name}
             draggable onDragStart={e => onDragStart(file, e)}>
            <button className="ftfile-check" title="Выделить (Shift — диапазон)"
                    onClick={e => { e.stopPropagation(); onToggle(file, e); }}>
                <i className={`bi ${selected ? 'bi-check-circle-fill' : 'bi-circle'}`} />
            </button>
            <div className={`ftfile-img ${loaded ? 'ready' : ''}`} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave}>
                {hover.overlay}
                {broken
                    ? <i className="bi bi-file-earmark-image ftfile-broken" />
                    : <img src={t.thumbUrl} alt="" loading="lazy" decoding="async" draggable={false}
                           onLoad={() => setLoaded(true)} onError={() => setBroken(true)} />}
                {file.kind === 'video' && <span className="ftfile-kind"><i className="bi bi-play-fill" /></span>}
                {file.kind === 'gif' && <span className="ftfile-kind gif">GIF</span>}
                {lib?.inLibrary && (
                    <span className={`ftfile-lib ${lib.inLibrary.trashed ? 'trashed' : ''}`}
                          title={lib.inLibrary.trashed ? 'Такой файл лежит в корзине библиотеки' : `Уже в библиотеке · «${lib.inLibrary.collectionName}»`}>
                        <i className={`bi ${lib.inLibrary.trashed ? 'bi-trash3' : 'bi-bookmark-check-fill'}`} />
                    </span>
                )}
                {lib?.copies?.length > 0 && (
                    <span className="ftfile-dup" title={`Такой же файл в этой папке:\n${lib.copies.map(p => p.split(/[\\/]/).pop()).join('\n')}`}>
                        <i className="bi bi-files" /> {lib.copies.length + 1}
                    </span>
                )}
            </div>
            <div className="ftfile-name">
                {seen && <i className="bi bi-eye ftfile-seen" title="Уже открывали в просмотрщике" />}
                {file.name}
            </div>
            <div className="ftfile-meta">{fmtSize(file.size)}</div>
        </div>
    );
});

function initialPath(prefs) {
    const requested = folderRequests.take();   // Ctrl+K from another tab
    if (requested) return requested;
    const last = getViewPrefs().restoreSession ? prefs.lastPath : null;
    return last || PrivateData.startPath || nodePath.join(sys.homedir, 'Pictures');
}

const FolderView = () => {
    const prefs = useFolderPrefs();
    const fb = useFolderBrowser(useMemo(() => initialPath(prefs), []));   // eslint-disable-line react-hooks/exhaustive-deps
    const [query, setQuery] = useState('');
    const [modalId, setModalId] = useState(null);
    const [visible, setVisible] = useState(CHUNK);
    const [editPath, setEditPath] = useState(0);
    const [importOpen, setImportOpen] = useState(false);
    const [selected, setSelected] = useState(() => new Set());   // file paths
    const [bulkOpen, setBulkOpen] = useState(false);
    const [ctxMenu, setCtxMenu] = useState(null);                // { x, y, folder }
    const [ctxImport, setCtxImport] = useState(null);            // folder path awaiting a collection
    const [dialog, setDialog] = useState(null);                  // FsDialog props
    const [libInfo, setLibInfo] = useState({});                  // path → { inLibrary, copies }
    const [libCheck, setLibCheck] = useState(null);              // { done, total } while checking
    const [seen, setSeen] = useState(() => new Set());           // paths opened in the viewer before
    const anchorRef = useRef(null);
    const scrollMemo = useRef(new Map());                        // path → { top, visible }
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const searchRef = useRef(null);

    // New folder → clear filter / selection; come back to where we were in folders
    // visited before (back, up, crumbs), otherwise start at the top.
    useEffect(() => {
        setQuery('');
        setSelected(new Set());
        anchorRef.current = null;
        const memo = fb.path && scrollMemo.current.get(fb.path);
        setVisible(memo ? Math.max(CHUNK, memo.visible) : CHUNK);
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: memo ? memo.top : 0 }));
    }, [fb.path]);

    const rememberScroll = useCallback(() => {
        if (fb.path && scrollRef.current) {
            scrollMemo.current.set(fb.path, { top: scrollRef.current.scrollTop, visible });
        }
    }, [fb.path, visible]);

    const q = query.trim().toLowerCase();
    const listing = fb.listing;

    const folders = useMemo(() => {
        if (!listing) return [];
        const list = listing.folders.filter(f => !q || f.name.toLowerCase().includes(q));
        if (prefs.sortBy === 'mtime') list.sort((a, b) => (a.mtime - b.mtime) * prefs.sortDir);
        else list.sort((a, b) => cmpName(a, b) * (prefs.sortBy === 'name' ? prefs.sortDir : 1));
        return list;
    }, [listing, q, prefs.sortBy, prefs.sortDir]);

    const kindCounts = useMemo(() => {
        const c = { all: 0, image: 0, video: 0, gif: 0 };
        listing?.files.forEach(f => { c.all++; c[f.kind]++; });
        return c;
    }, [listing]);

    const files = useMemo(() => {
        if (!listing) return [];
        const inLib = (f) => !!libInfo[f.path]?.inLibrary;
        const list = listing.files.filter(f =>
            (prefs.kind === 'all' || f.kind === prefs.kind) && (!q || f.name.toLowerCase().includes(q))
            && (prefs.lib === 'all' || (prefs.lib === 'in' ? inLib(f) : !inLib(f)))
            && (!prefs.unseen || !seen.has(f.path)));
        const by = {
            name:  cmpName,
            mtime: (a, b) => a.mtime - b.mtime,
            size:  (a, b) => a.size - b.size,
            type:  (a, b) => a.ext.localeCompare(b.ext) || cmpName(a, b),
        }[prefs.sortBy] || cmpName;
        return list.sort((a, b) => by(a, b) * prefs.sortDir);
    }, [listing, q, prefs.kind, prefs.sortBy, prefs.sortDir, prefs.lib, prefs.unseen, libInfo, seen]);

    const thumbs = useMemo(() => files.map(f => f.thumb), [files]);

    // Which files are already in the library / duplicated in this folder (by content).
    // Re-checked when the folder or the library changes; hashes are cached in main.
    const [libVersion, setLibVersion] = useState(0);
    useEffect(() => LibraryService.onLibraryChanged(() => setLibVersion(v => v + 1)), []);
    useEffect(() => {
        if (!listing?.files?.length) { setLibInfo({}); return; }
        let cancelled = false;
        const onProgress = (_, p) => { if (!cancelled) setLibCheck(p.total ? p : null); };
        ipcRenderer.on('fs:libraryCheckProgress', onProgress);
        fsApi.libraryCheck(listing.files.map(f => ({ path: f.path, size: f.size, mtime: f.mtime })))
            .then(res => { if (!cancelled && res) setLibInfo(res); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLibCheck(null); ipcRenderer.removeListener('fs:libraryCheckProgress', onProgress); });
        return () => { cancelled = true; ipcRenderer.send('fs:libraryCheckCancel'); ipcRenderer.removeListener('fs:libraryCheckProgress', onProgress); };
    }, [listing, libVersion]);
    // What was opened in the viewer, from the view history. Re-read when the viewer
    // closes, not while it's open: hiding files under it would break its paging.
    useEffect(() => {
        if (modalId || !listing?.files?.length) { if (!listing?.files?.length) setSeen(new Set()); return; }
        let cancelled = false;
        libraryApi.viewedKeys({ section: SOURCE_TYPES.FOLDER, keys: listing.files.map(f => f.path) })
            .then(keys => { if (!cancelled) setSeen(new Set(keys || [])); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [listing, modalId]);
    const unseenCount = useMemo(() => (listing?.files || []).filter(f => !seen.has(f.path)).length, [listing, seen]);

    const libCounts = useMemo(() => {
        const inLib = (listing?.files || []).filter(f => libInfo[f.path]?.inLibrary).length;
        return { in: inLib, new: (listing?.files?.length || 0) - inLib };
    }, [listing, libInfo]);
    const total = folders.length + files.length;

    // Grow the rendered window as the sentinel scrolls into view.
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || visible >= total) return;
        const io = new IntersectionObserver(([hit]) => {
            if (hit.isIntersecting) setVisible(v => Math.min(v + CHUNK, total));
        }, { root: scrollRef.current, rootMargin: '800px' });
        io.observe(el);
        return () => io.disconnect();
    }, [visible, total]);

    const openFolder = useCallback((p) => { rememberScroll(); fb.open(p); }, [fb.open, rememberScroll]);
    const goBack    = useCallback(() => { rememberScroll(); fb.back(); }, [fb.back, rememberScroll]);
    const goForward = useCallback(() => { rememberScroll(); fb.forward(); }, [fb.forward, rememberScroll]);
    const goUp      = useCallback(() => { rememberScroll(); fb.up(); }, [fb.up, rememberScroll]);
    const openFile = useCallback((t) => setModalId(t.uniqueId), []);

    // Selection: checkbox / Ctrl toggles one, Shift extends from the last clicked file.
    const toggleSelect = useCallback((file, e) => {
        // Resolve everything now: the state updater runs later, after the anchor moved.
        const idx = files.findIndex(f => f.path === file.path);
        const anchor = anchorRef.current != null ? files.findIndex(f => f.path === anchorRef.current) : -1;
        const range = !!e?.shiftKey && anchor >= 0;
        setSelected(prev => {
            const next = new Set(prev);
            if (range) {
                const [a, b] = anchor < idx ? [anchor, idx] : [idx, anchor];
                for (let i = a; i <= b; i++) next.add(files[i].path);
            } else if (next.has(file.path)) next.delete(file.path);
            else next.add(file.path);
            return next;
        });
        anchorRef.current = file.path;
    }, [files]);

    const selectedFiles = useMemo(() => files.filter(f => selected.has(f.path)), [files, selected]);
    const selectedSize = selectedFiles.reduce((n, f) => n + f.size, 0);

    useEffect(() => folderRequests.subscribe((p) => openFolder(p)));

    useCommands('folders', () => [
        { id: 'fs:newfolder', group: 'Папка', icon: 'bi-folder-plus', title: 'Новая папка', hint: 'Ctrl+Shift+N', run: newFolder },
        { id: 'fs:refresh', group: 'Папка', icon: 'bi-arrow-clockwise', title: 'Обновить папку', hint: 'F5', run: fb.refresh },
        { id: 'fs:explorer', group: 'Папка', icon: 'bi-box-arrow-up-right', title: 'Открыть в проводнике', run: () => fb.path && fsApi.open(fb.path) },
        { id: 'fs:pin', group: 'Папка', icon: 'bi-pin-angle', title: isPinned(fb.path) ? 'Открепить эту папку' : 'Закрепить эту папку', run: () => fb.path && togglePin(fb.path) },
        { id: 'fs:up', group: 'Папка', icon: 'bi-arrow-up', title: 'Наверх', hint: 'Backspace', run: goUp },
        ...folders.slice(0, 40).map(f => ({ id: `fs:sub:${f.path}`, group: 'Подпапки', icon: 'bi-folder2', title: f.name, run: () => openFolder(f.path) })),
    ]);

    const afterOp = useCallback(() => { setSelected(new Set()); fb.refresh(); }, [fb.refresh]);

    const renameEntry = useCallback((entryPath, isDir) => {
        const name = nodePath.basename(entryPath);
        const ext = isDir ? '' : nodePath.extname(name);
        setDialog({
            title: isDir ? 'Переименовать папку' : 'Переименовать файл',
            initial: name,
            selectTo: name.length - ext.length,
            submitLabel: 'Переименовать',
            onSubmit: async (v) => { await fsApi.rename(entryPath, v); afterOp(); },
        });
    }, [afterOp]);

    const newFolder = useCallback(() => {
        if (!fb.path) return;
        setDialog({
            title: 'Новая папка', icon: 'bi-folder-plus', initial: 'Новая папка', submitLabel: 'Создать',
            onSubmit: async (v) => { await fsApi.mkdir(fb.path, v); fb.refresh(); },
        });
    }, [fb.path, fb.refresh]);

    const trashEntries = useCallback((paths, label) => {
        if (!paths.length) return;
        setDialog({
            title: 'Удалить в корзину', icon: 'bi-trash3', danger: true, submitLabel: 'В корзину',
            text: `В корзину Windows: ${label}. Оттуда можно восстановить.`,
            onSubmit: async () => {
                const res = await fsApi.trash(paths);
                afterOp();
                notify({
                    message: res.failed.length ? `В корзине: ${res.done.length}, не удалось: ${res.failed.length}` : `Перемещено в корзину: ${res.done.length}`,
                    type: res.failed.length ? 'warning' : 'success',
                });
            },
        });
    }, [afterOp]);

    const moveTo = useCallback(async (paths, dest) => {
        if (!paths.length) return;
        const res = await fsApi.move(paths, dest);
        afterOp();
        const clash = res.skipped.filter(s => s.reason === 'exists').length;
        notify({
            message: [
                res.moved.length ? `Перемещено в «${nodePath.basename(dest) || dest}»: ${res.moved.length}` : 'Ничего не перемещено',
                clash ? `уже есть с таким именем: ${clash}` : null,
                res.failed.length ? `ошибок: ${res.failed.length}` : null,
            ].filter(Boolean).join(' · '),
            type: res.moved.length && !clash && !res.failed.length ? 'success' : 'warning',
        });
    }, [afterOp]);

    // Dragging a selected file drags the whole selection.
    const onDragFile = useCallback((file, e) => {
        const paths = selected.has(file.path) ? [...selected] : [file.path];
        e.dataTransfer.setData(DRAG_PATHS, JSON.stringify(paths));
        e.dataTransfer.effectAllowed = 'copyMove';
    }, [selected]);

    // Browser-style keys (ignored while typing or when the viewer is open).
    useEffect(() => {
        const onKey = (e) => {
            if (modalId || dialog) return;
            const el = document.activeElement;
            const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
            if (matches(e, 'fs.path'))   { e.preventDefault(); setEditPath(n => n + 1); return; }
            if (matches(e, 'fs.filter')) { e.preventDefault(); searchRef.current?.focus(); return; }
            if (typing) return;
            if (matches(e, 'common.selectAll')) { e.preventDefault(); setSelected(new Set(files.map(f => f.path))); return; }
            if (e.key === 'Escape') { setSelected(new Set()); setCtxMenu(null); return; }
            if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); }
            if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
            if ((e.altKey && e.key === 'ArrowUp') || e.key === 'Backspace') { e.preventDefault(); goUp(); }
            if (matches(e, 'fs.refresh')) { e.preventDefault(); fb.refresh(); }
            if (matches(e, 'fs.rename') && selected.size === 1) { e.preventDefault(); renameEntry([...selected][0], false); }
            if (e.key === 'Delete' && selected.size) { e.preventDefault(); trashEntries([...selected], filesWord(selected.size)); }
            if (matches(e, 'fs.newFolder')) { e.preventDefault(); newFolder(); }
        };
        const onMouse = (e) => {           // mouse side buttons
            if (modalId) return;
            if (e.button === 3) goBack();
            if (e.button === 4) goForward();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mouseup', onMouse);
        return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mouseup', onMouse); };
    }, [fb, modalId, dialog, files, goBack, goForward, goUp, selected, renameEntry, trashEntries, newFolder]);

    // Context menu closes on any outside click / scroll.
    useEffect(() => {
        if (!ctxMenu) return;
        const close = () => setCtxMenu(null);
        window.addEventListener('mousedown', close);
        window.addEventListener('wheel', close, { passive: true });
        return () => { window.removeEventListener('mousedown', close); window.removeEventListener('wheel', close); };
    }, [ctxMenu]);

    const report = (res, what) => {
        const added = res?.results?.length || 0;
        const skipped = res?.skipped?.length || 0;
        notify({
            message: added
                ? `${what}: ${added}${skipped ? `, пропущено дубликатов: ${skipped}` : ''}`
                : skipped ? `Уже есть в библиотеке (${skipped})` : 'Подходящих файлов не найдено',
            type: added ? 'success' : 'warning',
        });
    };

    const importSelected = async (collectionId) => {
        setBulkOpen(false);
        pushRecentCollection(collectionId);
        const res = await LibraryService.importFiles({ filePaths: selectedFiles.map(f => f.path), collectionId });
        report(res, 'Импортировано');
        setSelected(new Set());
    };

    const importFolderAt = async (dirPath, collectionId, as = null) => {
        setCtxImport(null);
        pushRecentCollection(collectionId);
        if (as) {
            // A folder as manga: its pictures are pages, subfolders chapters
            // ('auto'), or every subfolder its own manga ('each').
            try {
                const items = await mangaApi.importFolder(dirPath, { collectionId: collectionId ?? null, mode: as === 'manga-each' ? 'each' : 'auto' });
                notify({
                    message: items.length === 1 ? `Манга «${items[0].title}» — ${items[0].pageCount} стр.` : `Манги добавлено: ${items.length}`,
                    type: 'success',
                    action: items.length === 1 ? { label: 'Читать', onClick: () => readLibraryManga(items[0]) } : null,
                });
            } catch (e) {
                notify({ message: String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), type: 'warning' });
            }
            return;
        }
        report(await LibraryService.importDirectory({ dirPath, collectionId }), 'Импортировано из папки');
    };

    const importFolder = async (collectionId) => {
        setImportOpen(false);
        pushRecentCollection(collectionId);
        const res = await LibraryService.importDirectory({ dirPath: fb.path, collectionId });
        const added = res?.results?.length || 0;
        const skipped = res?.skipped?.length || 0;
        notify({
            message: added
                ? `Импортировано: ${added}${skipped ? `, пропущено дубликатов: ${skipped}` : ''}`
                : skipped ? `Все файлы уже есть в библиотеке (${skipped})` : 'Подходящих файлов не найдено',
            type: added ? 'success' : 'warning',
        });
    };

    const pinned = fb.path && isPinned(fb.path);
    const stats = listing?.stats;
    const hidden = listing ? listing.files.length - files.length + listing.folders.length - folders.length : 0;

    return (
        <div className="folder-layout" style={{ '--tile': `${prefs.tile}px` }}>
            <FolderSidebar current={fb.path} onOpen={openFolder} onDropPaths={moveTo} />

            <div className="folder-main">
                <div className="folder-toolbar">
                    <div className="ftb-nav">
                        <button className="ftb-btn" disabled={!fb.canBack} onClick={goBack} title="Назад (Alt+←)"><i className="bi bi-arrow-left" /></button>
                        <button className="ftb-btn" disabled={!fb.canForward} onClick={goForward} title="Вперёд (Alt+→)"><i className="bi bi-arrow-right" /></button>
                        <button className="ftb-btn" disabled={!fb.canUp} onClick={goUp} title="Наверх (Backspace)"><i className="bi bi-arrow-up" /></button>
                    </div>
                    <PathBar path={fb.path} onOpen={openFolder} editSignal={editPath} />
                    <div className="ftb-nav">
                        <button className="ftb-btn" disabled={!fb.path} onClick={newFolder} title="Новая папка (Ctrl+Shift+N)">
                            <i className="bi bi-folder-plus" />
                        </button>
                        <button className="ftb-btn" onClick={fb.refresh} title="Обновить (F5)">
                            <i className={`bi bi-arrow-clockwise ${fb.loading ? 'spin' : ''}`} />
                        </button>
                        <button className={`ftb-btn ${pinned ? 'on' : ''}`} disabled={!fb.path} onClick={() => togglePin(fb.path)}
                                title={pinned ? 'Открепить' : 'Закрепить в боковой панели'}>
                            <i className={`bi ${pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle'}`} />
                        </button>
                        <button className="ftb-btn" disabled={!fb.path} onClick={() => fsApi.open(fb.path)} title="Открыть в проводнике">
                            <i className="bi bi-box-arrow-up-right" />
                        </button>
                        <div className="ftb-import">
                            <button className={`ftb-btn primary ${importOpen ? 'on' : ''}`} disabled={!files.length && !folders.length}
                                    onClick={() => setImportOpen(v => !v)} title="Импортировать папку в библиотеку">
                                <i className="bi bi-box-arrow-in-down" /> <span>В библиотеку</span>
                            </button>
                            {importOpen && (
                                <>
                                    <div className="bulk-move-backdrop" onMouseDown={() => setImportOpen(false)} />
                                    <div className="ftb-import-panel">
                                        <div className="ftb-import-hint">Вся папка вместе с подпапками — в коллекцию:</div>
                                        <CollectionTreeSelect value={undefined} onSelect={importFolder} onClose={() => setImportOpen(false)} />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="folder-filters">
                    <div className="ff-kinds">
                        {KINDS.map(k => (
                            <button key={k.id}
                                    className={`ff-kind ${prefs.kind === k.id ? 'active' : ''}`}
                                    disabled={k.id !== 'all' && !kindCounts[k.id]}
                                    onClick={() => setFolderPrefs({ kind: k.id })}>
                                <i className={`bi ${k.icon}`} /> {k.label}
                                <span className="ff-count">{kindCounts[k.id]}</span>
                            </button>
                        ))}
                    </div>

                    <div className="ff-kinds ff-lib" title="По наличию в библиотеке (сравнение по содержимому)">
                        {[
                            { id: 'all', label: 'Все' },
                            { id: 'new', label: 'Новые', count: libCounts.new, icon: 'bi-plus-circle' },
                            { id: 'in',  label: 'В библиотеке', count: libCounts.in, icon: 'bi-bookmark-check' },
                        ].map(o => (
                            <button key={o.id} className={`ff-kind ${prefs.lib === o.id ? 'active' : ''}`}
                                    onClick={() => setFolderPrefs({ lib: o.id })}>
                                {o.icon && <i className={`bi ${o.icon}`} />} {o.label}
                                {o.count != null && <span className="ff-count">{libCheck ? '…' : o.count}</span>}
                            </button>
                        ))}
                        <button className={`ff-kind ${prefs.unseen ? 'active' : ''}`}
                                title="Скрыть файлы, которые уже открывали в просмотрщике (по истории просмотров)"
                                onClick={() => setFolderPrefs({ unseen: !prefs.unseen })}>
                            <i className={`bi ${prefs.unseen ? 'bi-eye-slash-fill' : 'bi-eye-slash'}`} /> Не просмотренные
                            <span className="ff-count">{unseenCount}</span>
                        </button>
                        {libCheck && (
                            <span className="ff-libcheck" title="Сверяю файлы с библиотекой">
                                <i className="bi bi-arrow-repeat spin" /> {libCheck.done}/{libCheck.total}
                            </span>
                        )}
                    </div>

                    <div className="ff-search">
                        <i className="bi bi-search" />
                        <input ref={searchRef} placeholder="Фильтр по имени (Ctrl+F)" value={query}
                               onChange={e => setQuery(e.target.value)}
                               onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }} />
                        {query && <button onClick={() => setQuery('')}><i className="bi bi-x-lg" /></button>}
                    </div>

                    <div className="ff-sort">
                        <select className="form-select form-select-sm" value={prefs.sortBy}
                                onChange={e => setFolderPrefs({ sortBy: e.target.value })}>
                            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                        <button className="ftb-btn" onClick={() => setFolderPrefs({ sortDir: -prefs.sortDir })}
                                title={prefs.sortDir > 0 ? 'По возрастанию' : 'По убыванию'}>
                            <i className={`bi ${prefs.sortDir > 0 ? 'bi-sort-down-alt' : 'bi-sort-down'}`} />
                        </button>
                    </div>

                    <label className="ff-zoom" title="Размер плиток">
                        <i className="bi bi-grid-3x3-gap" />
                        <input type="range" min={130} max={320} step={10} value={prefs.tile}
                               onChange={e => setFolderPrefs({ tile: Number(e.target.value) })} />
                        <i className="bi bi-grid" />
                    </label>
                </div>

                {stats && (
                    <div className="folder-stats">
                        <span><i className="bi bi-folder2" /> {stats.folders}</span>
                        <span><i className="bi bi-images" /> {filesWord(stats.files)}</span>
                        <span><i className="bi bi-hdd" /> {fmtSize(stats.totalSize)}</span>
                        {stats.otherFiles > 0 && <span className="muted">+ {stats.otherFiles} прочих не показано</span>}
                        {hidden > 0 && <span className="muted">скрыто фильтром: {hidden}</span>}
                    </div>
                )}

                {selected.size > 0 && (
                    <div className="folder-selbar">
                        <span className="fsel-count"><i className="bi bi-check2-square" /> Выбрано: <b>{selected.size}</b> · {fmtSize(selectedSize)}</span>
                        <button className="ftb-btn" onClick={() => setSelected(new Set(files.map(f => f.path)))} title="Выделить всё (Ctrl+A)">Все</button>
                        <button className="ftb-btn" onClick={() => setSelected(new Set())} title="Снять выделение (Esc)">Снять</button>
                        <span className="fsel-sep" />
                        {selected.size === 1 && (
                            <button className="ftb-btn" onClick={() => renameEntry([...selected][0], false)} title="Переименовать (F2)">
                                <i className="bi bi-input-cursor-text" /> <span>Имя</span>
                            </button>
                        )}
                        <button className="ftb-btn danger" onClick={() => trashEntries([...selected], filesWord(selected.size))} title="Удалить в корзину (Del)">
                            <i className="bi bi-trash3" /> <span>В корзину</span>
                        </button>
                        {selectedFiles.filter(f => f.kind !== 'video').length > 1 && (
                            <MakeMangaButton className="ftb-btn" files={selectedFiles.filter(f => f.kind !== 'video').map(f => f.path)}
                                             defaultTitle={nodePath.basename(fb.path || '')} onDone={() => setSelected(new Set())} />
                        )}
                        <span className="fsel-hint">перетащи на папку, чтобы переместить</span>
                        <div className="ftb-import fsel-import">
                            <button className={`ftb-btn primary ${bulkOpen ? 'on' : ''}`} onClick={() => setBulkOpen(v => !v)}>
                                <i className="bi bi-box-arrow-in-down" /> <span>Импортировать выбранные</span>
                            </button>
                            {bulkOpen && (
                                <>
                                    <div className="bulk-move-backdrop" onMouseDown={() => setBulkOpen(false)} />
                                    <div className="ftb-import-panel">
                                        <CollectionTreeSelect value={undefined} onSelect={importSelected} onClose={() => setBulkOpen(false)} />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                <div className="folder-grid-scroll" ref={scrollRef}>
                    {fb.error ? (
                        <div className="folder-empty error">
                            <i className="bi bi-exclamation-octagon" />
                            <div className="fe-title">{fb.error.message}</div>
                            <div className="fe-sub">{fb.error.path}</div>
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => fb.canBack ? fb.back() : setEditPath(n => n + 1)}>
                                {fb.canBack ? 'Назад' : 'Ввести путь'}
                            </button>
                        </div>
                    ) : !listing ? (
                        <div className="folder-grid skeleton">
                            {Array.from({ length: 18 }, (_, i) => <div key={i} className="ftfile-skel" />)}
                        </div>
                    ) : total === 0 ? (
                        <div className="folder-empty">
                            <i className={`bi ${q || prefs.kind !== 'all' || prefs.lib !== 'all' || prefs.unseen ? 'bi-funnel' : 'bi-folder2-open'}`} />
                            <div className="fe-title">{q || prefs.kind !== 'all' || prefs.lib !== 'all' || prefs.unseen ? 'Ничего не подходит под фильтр' : 'Здесь нет медиафайлов'}</div>
                            {(q || prefs.kind !== 'all' || prefs.lib !== 'all' || prefs.unseen) && (
                                <button className="btn btn-sm btn-outline-secondary" onClick={() => { setQuery(''); setFolderPrefs({ kind: 'all', lib: 'all', unseen: false }); }}>
                                    Сбросить фильтр
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="folder-grid">
                            {folders.slice(0, visible).map(f => (
                                <FolderTile
                                    key={f.path}
                                    name={f.name}
                                    denied={f.denied}
                                    previews={(f.previews || []).map(p => fsThumbUrl(p, 220))}
                                    meta={f.denied ? 'Нет доступа'
                                        : [f.files ? filesWord(f.files) : null, f.dirs ? `${f.dirs} ${plural(f.dirs, 'папка', 'папки', 'папок')}` : null]
                                            .filter(Boolean).join(' · ') || 'Пусто'}
                                    onOpen={() => openFolder(f.path)}
                                    onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, folder: f }); }}
                                    dropType={DRAG_PATHS}
                                    onDropData={(data) => moveTo(JSON.parse(data || '[]'), f.path)}
                                />
                            ))}
                            {files.slice(0, Math.max(0, visible - folders.length)).map(f => (
                                <FileTile key={f.path} file={f} onOpen={openFile} lib={libInfo[f.path]} seen={seen.has(f.path)}
                                          selected={selected.has(f.path)} selecting={selected.size > 0}
                                          onToggle={toggleSelect} onDragStart={onDragFile} />
                            ))}
                            <div ref={sentinelRef} className="folder-sentinel" aria-hidden="true" />
                        </div>
                    )}
                </div>
            </div>

            {ctxMenu && (
                <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onMouseDown={e => e.stopPropagation()}>
                    <div className="ctx-title">{ctxMenu.folder.name}</div>
                    <button onClick={() => { setCtxMenu(null); openFolder(ctxMenu.folder.path); }}>
                        <i className="bi bi-folder2-open" /> Открыть
                    </button>
                    <button onClick={() => { setCtxMenu(null); fsApi.open(ctxMenu.folder.path); }}>
                        <i className="bi bi-box-arrow-up-right" /> Открыть в проводнике
                    </button>
                    <button onClick={() => { setCtxMenu(null); togglePin(ctxMenu.folder.path); }}>
                        <i className={`bi ${isPinned(ctxMenu.folder.path) ? 'bi-pin-angle-fill' : 'bi-pin-angle'}`} />
                        {isPinned(ctxMenu.folder.path) ? ' Открепить' : ' Закрепить'}
                    </button>
                    <button onClick={() => { setCtxMenu(null); renameEntry(ctxMenu.folder.path, true); }}>
                        <i className="bi bi-input-cursor-text" /> Переименовать
                    </button>
                    <button className="danger" onClick={() => { setCtxMenu(null); trashEntries([ctxMenu.folder.path], `Папка «${ctxMenu.folder.name}» со всем содержимым`); }}>
                        <i className="bi bi-trash3" /> Удалить в корзину
                    </button>
                    <div className="ctx-sep" />
                    <button onClick={() => { setCtxImport({ path: ctxMenu.folder.path, name: ctxMenu.folder.name, x: ctxMenu.x, y: ctxMenu.y }); setCtxMenu(null); }}>
                        <i className="bi bi-box-arrow-in-down" /> Импортировать в библиотеку…
                    </button>
                    <button onClick={() => { setCtxImport({ path: ctxMenu.folder.path, name: ctxMenu.folder.name, x: ctxMenu.x, y: ctxMenu.y, as: 'manga' }); setCtxMenu(null); }}>
                        <i className="bi bi-book" /> Импортировать как мангу…
                    </button>
                    {ctxMenu.folder.dirs > 1 && (
                        <button onClick={() => { setCtxImport({ path: ctxMenu.folder.path, name: ctxMenu.folder.name, x: ctxMenu.x, y: ctxMenu.y, as: 'manga-each' }); setCtxMenu(null); }}>
                            <i className="bi bi-collection" /> Каждая подпапка — отдельная манга…
                        </button>
                    )}
                </div>
            )}
            {ctxImport && (
                <>
                    <div className="bulk-move-backdrop" onMouseDown={() => setCtxImport(null)} />
                    <div className="ctx-import" style={{ left: Math.min(ctxImport.x, window.innerWidth - 340), top: Math.min(ctxImport.y, window.innerHeight - 440) }}>
                        <div className="ftb-import-hint">
                            {ctxImport.as === 'manga' ? `«${ctxImport.name}» как манга (подпапки — главы) — в коллекцию:`
                                : ctxImport.as === 'manga-each' ? `Подпапки «${ctxImport.name}» — отдельные манги — в коллекцию:`
                                : `«${ctxImport.name}» с подпапками — в коллекцию:`}
                        </div>
                        <CollectionTreeSelect value={undefined} onSelect={(id) => importFolderAt(ctxImport.path, id, ctxImport.as)} onClose={() => setCtxImport(null)} />
                    </div>
                </>
            )}

            {dialog && <FsDialog {...dialog} onClose={() => setDialog(null)} />}

            <Modal
                fileId={modalId}
                mainArray={thumbs}
                displayFiles={thumbs}
                modalUpdater={(file) => setModalId(file?.uniqueId || null)}
            />
        </div>
    );
};

export default FolderView;
