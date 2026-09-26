import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import PrivateData from '@data/private';
import {fsApi, fsThumbUrl} from '@/Infrastructure/Ipc';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import Modal from '@react/Modal/Modal';
import FolderTile from '@react/Common/FolderTile';
import CollectionTreeSelect, {pushRecentCollection} from '@react/Library/Collection/CollectionTreeSelect';
import FolderSidebar from './FolderSidebar';
import PathBar from './PathBar';
import {useFolderBrowser} from './useFolderBrowser';
import {isPinned, setFolderPrefs, togglePin, useFolderPrefs} from './folderPrefs';

const os = window.require('os');
const nodePath = window.require('path');

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

const FileTile = React.memo(({ file, onOpen }) => {
    const [loaded, setLoaded] = useState(false);
    const [broken, setBroken] = useState(false);
    const t = file.thumb;
    return (
        <div className="ftfile" onClick={() => onOpen(t)} onContextMenu={e => { e.preventDefault(); onOpen(t); }} title={file.name}>
            <div className={`ftfile-img ${loaded ? 'ready' : ''}`}>
                {broken
                    ? <i className="bi bi-file-earmark-image ftfile-broken" />
                    : <img src={t.thumbUrl} alt="" loading="lazy" decoding="async" draggable={false}
                           onLoad={() => setLoaded(true)} onError={() => setBroken(true)} />}
                {file.kind === 'video' && <span className="ftfile-kind"><i className="bi bi-play-fill" /></span>}
                {file.kind === 'gif' && <span className="ftfile-kind gif">GIF</span>}
            </div>
            <div className="ftfile-name">{file.name}</div>
            <div className="ftfile-meta">{fmtSize(file.size)}</div>
        </div>
    );
});

function initialPath(prefs) {
    return prefs.lastPath || PrivateData.startPath || nodePath.join(os.homedir(), 'Pictures');
}

const FolderView = () => {
    const prefs = useFolderPrefs();
    const fb = useFolderBrowser(useMemo(() => initialPath(prefs), []));   // eslint-disable-line react-hooks/exhaustive-deps
    const [query, setQuery] = useState('');
    const [modalId, setModalId] = useState(null);
    const [visible, setVisible] = useState(CHUNK);
    const [editPath, setEditPath] = useState(0);
    const [importOpen, setImportOpen] = useState(false);
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const searchRef = useRef(null);

    // New folder → clear the name filter, scroll to top, restart the render window.
    useEffect(() => {
        setQuery('');
        setVisible(CHUNK);
        scrollRef.current?.scrollTo({ top: 0 });
    }, [fb.path]);

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
        const list = listing.files.filter(f =>
            (prefs.kind === 'all' || f.kind === prefs.kind) && (!q || f.name.toLowerCase().includes(q)));
        const by = {
            name:  cmpName,
            mtime: (a, b) => a.mtime - b.mtime,
            size:  (a, b) => a.size - b.size,
            type:  (a, b) => a.ext.localeCompare(b.ext) || cmpName(a, b),
        }[prefs.sortBy] || cmpName;
        return list.sort((a, b) => by(a, b) * prefs.sortDir);
    }, [listing, q, prefs.kind, prefs.sortBy, prefs.sortDir]);

    const thumbs = useMemo(() => files.map(f => f.thumb), [files]);
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

    const openFolder = useCallback((p) => fb.open(p), [fb.open]);
    const openFile = useCallback((t) => setModalId(t.uniqueId), []);

    // Browser-style keys (ignored while typing or when the viewer is open).
    useEffect(() => {
        const onKey = (e) => {
            if (modalId) return;
            const el = document.activeElement;
            const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
            if (e.ctrlKey && e.code === 'KeyL') { e.preventDefault(); setEditPath(n => n + 1); return; }
            if (e.ctrlKey && e.code === 'KeyF') { e.preventDefault(); searchRef.current?.focus(); return; }
            if (typing) return;
            if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); fb.back(); }
            if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); fb.forward(); }
            if ((e.altKey && e.key === 'ArrowUp') || e.key === 'Backspace') { e.preventDefault(); fb.up(); }
            if (e.key === 'F5') { e.preventDefault(); fb.refresh(); }
        };
        const onMouse = (e) => {           // mouse side buttons
            if (modalId) return;
            if (e.button === 3) fb.back();
            if (e.button === 4) fb.forward();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mouseup', onMouse);
        return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mouseup', onMouse); };
    }, [fb, modalId]);

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
            <FolderSidebar current={fb.path} onOpen={openFolder} />

            <div className="folder-main">
                <div className="folder-toolbar">
                    <div className="ftb-nav">
                        <button className="ftb-btn" disabled={!fb.canBack} onClick={fb.back} title="Назад (Alt+←)"><i className="bi bi-arrow-left" /></button>
                        <button className="ftb-btn" disabled={!fb.canForward} onClick={fb.forward} title="Вперёд (Alt+→)"><i className="bi bi-arrow-right" /></button>
                        <button className="ftb-btn" disabled={!fb.canUp} onClick={fb.up} title="Наверх (Backspace)"><i className="bi bi-arrow-up" /></button>
                    </div>
                    <PathBar path={fb.path} onOpen={openFolder} editSignal={editPath} />
                    <div className="ftb-nav">
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
                            <i className={`bi ${q || prefs.kind !== 'all' ? 'bi-funnel' : 'bi-folder2-open'}`} />
                            <div className="fe-title">{q || prefs.kind !== 'all' ? 'Ничего не подходит под фильтр' : 'Здесь нет медиафайлов'}</div>
                            {(q || prefs.kind !== 'all') && (
                                <button className="btn btn-sm btn-outline-secondary" onClick={() => { setQuery(''); setFolderPrefs({ kind: 'all' }); }}>
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
                                />
                            ))}
                            {files.slice(0, Math.max(0, visible - folders.length)).map(f => (
                                <FileTile key={f.path} file={f} onOpen={openFile} />
                            ))}
                            <div ref={sentinelRef} className="folder-sentinel" aria-hidden="true" />
                        </div>
                    )}
                </div>
            </div>

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
