import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {openCompare} from '../Compare/CompareView';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {appUrl, ipcRenderer} from '@/Infrastructure/electron';
import {DEFAULT_FILTERS, collectionOptions, filterGroups, fullyMarked, planMarks, summarize} from '@/shared/duplicateFilters';

const fmtSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i > 0 && n < 100 ? 1 : 0)} ${units[i]}`;
};

const fmtDate = (t) => (t ? new Date(t * 1000).toLocaleDateString('ru-RU') : '—');
const similarityOf = (d) => Math.round(((64 - d) / 64) * 100);

const DEFAULT_DISTANCE = 8;   // bits of 64 → ~88% similar

const MB = 1024 * 1024;
const SIZE_STEPS = [
    { value: 0, label: 'Любой размер' },
    { value: MB, label: 'От 1 МБ' },
    { value: 10 * MB, label: 'От 10 МБ' },
    { value: 100 * MB, label: 'От 100 МБ' },
];

// Listen to a main-process progress channel while mounted.
function useIpcProgress(channel, onValue) {
    useEffect(() => {
        const h = (_, v) => onValue(v);
        ipcRenderer.on(channel, h);
        return () => ipcRenderer.removeListener(channel, h);
    }, [channel, onValue]);
}

// Two finders in one tab:
//   exact   — byte-identical files (content hash); the oldest copy is kept by default
//   similar — perceptual hash: re-compressed / resized / lightly edited copies; the
//             best-quality copy (most pixels, then biggest file) is kept by default
const DuplicatesTab = () => {
    const [mode, setMode] = useState('exact');
    const [data, setData] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [scanPct, setScanPct] = useState(null);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(() => new Set());
    const [busy, setBusy] = useState(false);

    // Similar-mode state
    const [status, setStatus] = useState(null);        // { total, missing }
    const [hashing, setHashing] = useState(null);      // { done, total } while computing
    const [distance, setDistance] = useState(DEFAULT_DISTANCE);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const setFilter = useCallback((key, value) => setFilters(prev => ({ ...prev, [key]: value })), []);

    useIpcProgress('library:phashProgress', useCallback(p => setHashing(p), []));
    useIpcProgress('library:similarProgress', useCallback(p => setScanPct(p), []));

    const applyResult = useCallback((res) => {
        setData(res);
        // Nothing is marked until asked: the marks decide what goes to the trash.
        setSelected(new Set());
    }, []);

    const scan = useCallback(async () => {
        setScanning(true);
        setScanPct(null);
        setError(null);
        try {
            applyResult(mode === 'exact'
                ? await LibraryService.findDuplicates()
                : await LibraryService.findSimilar(distance));
        } catch (e) {
            setError(e.message);
        } finally {
            setScanning(false);
            setScanPct(null);
        }
    }, [mode, distance, applyResult]);

    const refreshStatus = useCallback(async () => {
        try { setStatus(await LibraryService.phashStatus()); } catch { /* ignore */ }
    }, []);

    // Exact mode scans right away (cheap); similar mode first shows the hash status.
    useEffect(() => {
        setData(null);
        setSelected(new Set());
        if (mode === 'exact') scan();
        else refreshStatus();
    }, [mode]);   // eslint-disable-line react-hooks/exhaustive-deps

    const computeHashes = useCallback(async () => {
        setHashing({ done: 0, total: status?.missing || 0 });
        try {
            const res = await LibraryService.computePhashes();
            if (res?.failed) notify({ message: `Не удалось обработать: ${res.failed}`, type: 'warning' });
        } catch (e) {
            notify({ message: `Ошибка: ${e.message}`, type: 'danger' });
        } finally {
            setHashing(null);
            refreshStatus();
        }
    }, [status, refreshStatus]);

    const toggle = useCallback((id) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const keepFirst = useCallback((group) => {
        setSelected(prev => {
            const next = new Set(prev);
            group.items.forEach((it, i) => (i === 0 ? next.delete(it.id) : next.add(it.id)));
            return next;
        });
    }, []);

    const similar = mode === 'similar';
    const hashesReady = status && status.missing === 0;

    // Type applies to exact copies only (the similar search is images only), resolution
    // to similar ones only (exact copies share it). A collection emptied by a cleanup
    // falls back to "all".
    const collections = useMemo(() => collectionOptions(data?.groups || []), [data]);
    const collection = collections.some(c => c.id === filters.collection) ? filters.collection : 'all';
    const groups = useMemo(() => filterGroups(data?.groups || [], {
        ...filters,
        collection,
        type: similar ? 'all' : filters.type,
        differentResolution: similar && filters.differentResolution,
    }), [data, filters, collection, similar]);
    const shown = useMemo(() => summarize(groups), [groups]);

    // Hidden groups keep their marks but never go to the trash.
    const marked = useMemo(() => groups.flatMap(g => g.items.filter(it => selected.has(it.id)).map(it => it.id)), [groups, selected]);

    const emptied = useMemo(() => fullyMarked(groups, selected), [groups, selected]);
    const chosen = collections.find(c => c.id === collection);

    const applyMarks = useCallback(({ mark = [], unmark = [] }) => {
        setSelected(prev => {
            const next = new Set(prev);
            unmark.forEach(id => next.delete(id));
            mark.forEach(id => next.add(id));
            return next;
        });
    }, []);
    const clearMarks = useCallback((list) => {
        applyMarks({ unmark: list.flatMap(g => g.items.map(it => it.id)) });
    }, [applyMarks]);

    const trashSelected = useCallback(async () => {
        if (!marked.length || busy) return;
        setBusy(true);
        try {
            const ids = marked;
            await LibraryService.deleteItems(ids, false);
            notify({ message: `В корзину отправлено: ${ids.length}`, type: 'success' });
            await scan();
        } catch (e) {
            notify({ message: `Не удалось: ${e.message}`, type: 'danger' });
        } finally {
            setBusy(false);
        }
    }, [marked, busy, scan]);

    return (
        <div className="settings-body cp-manage">
            <div className="cp-manage-head">
                <div>
                    <h3>Поиск дубликатов</h3>
                    <p className="cp-manage-desc">
                        {similar
                            ? 'Визуально похожие изображения: пережатые, уменьшенные, слегка изменённые копии. Видео не сравниваются.'
                            : 'Точные копии по содержимому файла (хеш). Оставь нужные, лишние — в корзину.'}
                    </p>
                </div>
                <div className="cp-seg">
                    <button className={!similar ? 'active' : ''} onClick={() => setMode('exact')}>Точные</button>
                    <button className={similar ? 'active' : ''} onClick={() => setMode('similar')}>Похожие</button>
                </div>
            </div>

            {similar && status && (
                <div className="cp-sim-controls">
                    <div className="cp-sim-status">
                        {hashing ? (
                            <>
                                <span>Отпечатки: {hashing.done} / {hashing.total}</span>
                                <div className="progress" style={{ height: 6 }}>
                                    <div className="progress-bar" style={{ width: `${hashing.total ? (hashing.done / hashing.total) * 100 : 0}%` }} />
                                </div>
                            </>
                        ) : status.missing > 0 ? (
                            <>
                                <span>Отпечатки посчитаны для <b>{status.total - status.missing}</b> из <b>{status.total}</b> изображений</span>
                                <button className="btn btn-sm btn-outline-primary" onClick={computeHashes}>
                                    <i className="bi bi-fingerprint me-1" />Посчитать {status.missing}
                                </button>
                            </>
                        ) : (
                            <span><i className="bi bi-check2-circle me-1" />Отпечатки готовы для всех {status.total} изображений</span>
                        )}
                    </div>

                    <label className="cp-sim-threshold">
                        <span>Строго</span>
                        <input
                            type="range" min={2} max={16} step={1}
                            value={distance}
                            onChange={e => setDistance(Number(e.target.value))}
                        />
                        <span>Мягко</span>
                        <b>≈ {similarityOf(distance)}%</b>
                    </label>

                    <button
                        className="btn btn-sm btn-primary"
                        onClick={scan}
                        disabled={scanning || !!hashing || !status.total || status.total === status.missing}
                        title={hashesReady ? '' : 'Сравниваются только изображения с посчитанными отпечатками'}
                    >
                        <i className={`bi ${scanning ? 'bi-arrow-repeat spin' : 'bi-search'} me-1`} />
                        {scanning ? `Сравниваю${scanPct != null ? ` ${scanPct}%` : '…'}` : 'Найти похожие'}
                    </button>
                </div>
            )}

            {!similar && (
                <div className="cp-sim-controls cp-sim-controls--compact">
                    <button className="btn btn-outline-secondary btn-sm" onClick={scan} disabled={scanning}>
                        <i className={`bi bi-arrow-repeat me-1 ${scanning ? 'spin' : ''}`} />
                        {scanning ? 'Сканирую…' : 'Пересканировать'}
                    </button>
                </div>
            )}

            {error && <div className="settings-error">{error}</div>}

            {data && !scanning && data.totalGroups === 0 && (
                <div className="cp-empty">
                    <i className="bi bi-check2-circle" />
                    <span>{similar ? 'Похожих изображений не найдено' : 'Дубликатов не найдено'}</span>
                </div>
            )}

            {data && data.totalGroups > 0 && (
                <>
                    <div className="cp-dup-filters">
                        <label className="form-check form-switch cp-dup-switch" title="Скрыть группы, где все копии лежат в одной коллекции">
                            <input
                                className="form-check-input" type="checkbox"
                                checked={filters.acrossCollections}
                                onChange={e => setFilter('acrossCollections', e.target.checked)}
                            />
                            <span>В разных коллекциях</span>
                        </label>
                        {similar && (
                            <label className="form-check form-switch cp-dup-switch" title="Только группы, где есть копия с другим разрешением">
                                <input
                                    className="form-check-input" type="checkbox"
                                    checked={filters.differentResolution}
                                    onChange={e => setFilter('differentResolution', e.target.checked)}
                                />
                                <span>Разное разрешение</span>
                            </label>
                        )}
                        <select
                            className="form-select form-select-sm" aria-label="Коллекция"
                            value={collection}
                            onChange={e => setFilter('collection', e.target.value)}
                        >
                            <option value="all">Все коллекции</option>
                            {collections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.groups})</option>)}
                        </select>
                        {!similar && (
                            <select
                                className="form-select form-select-sm" aria-label="Тип файлов"
                                value={filters.type}
                                onChange={e => setFilter('type', e.target.value)}
                            >
                                <option value="all">Все типы</option>
                                <option value="image">Картинки</option>
                                <option value="gif">GIF</option>
                                <option value="video">Видео</option>
                            </select>
                        )}
                        <select
                            className="form-select form-select-sm" aria-label="Размер файла"
                            value={filters.minSize}
                            onChange={e => setFilter('minSize', Number(e.target.value))}
                        >
                            {SIZE_STEPS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>

                    <div className="cp-dup-summary">
                        Групп: <b>{shown.totalGroups}</b>
                        {shown.totalGroups !== data.totalGroups && <> из {data.totalGroups}</>} · файлов: <b>{shown.totalItems}</b> ·
                        можно освободить до <b>{fmtSize(shown.reclaimable)}</b>
                    </div>

                    {!groups.length && (
                        <div className="cp-empty">
                            <i className="bi bi-funnel" />
                            <span>С такими фильтрами групп нет</span>
                            <button className="cp-linkbtn" onClick={() => setFilters(DEFAULT_FILTERS)}>Сбросить фильтры</button>
                        </div>
                    )}

                    <div className="cp-dup-groups">
                        {groups.map(group => (
                            <div key={group.hash} className="cp-dup-group">
                                <div className="cp-dup-group-head">
                                    <span>
                                        {group.items.length} {similar ? 'похожих' : 'копии'}
                                        {!similar && <> · {fmtSize(group.items[0].size)}</>}
                                    </span>
                                    <button className="cp-linkbtn" title="Сравнить первые два бок о бок"
                                            onClick={() => openCompare(group.items.slice(0, 2).map(it => ({
                                                ...it, url: appUrl(`library://item/${it.id}`),
                                            })), { onDone: scan })}>
                                        <i className="bi bi-layout-split" /> Сравнить
                                    </button>
                                    {group.items.some(it => selected.has(it.id)) && (
                                        <button className="cp-linkbtn" onClick={() => clearMarks([group])}>Снять</button>
                                    )}
                                    <button className="cp-linkbtn" onClick={() => keepFirst(group)}>
                                        {similar ? 'Оставить только лучшую' : 'Оставить только старую'}
                                    </button>
                                </div>
                                <div className="cp-dup-items">
                                    {group.items.map((it, i) => {
                                        const isMarked = selected.has(it.id);
                                        return (
                                            <div
                                                key={it.id}
                                                className={`cp-dup-item ${isMarked ? 'marked' : ''}`}
                                                onClick={() => toggle(it.id)}
                                                title={it.title}
                                            >
                                                <img src={it.thumbPath} alt={it.title} loading="lazy" draggable={false} />
                                                <div className="cp-dup-item-overlay">
                                                    <i className={`bi ${isMarked ? 'bi-trash3-fill' : 'bi-check-circle'}`} />
                                                </div>
                                                {i === 0 && !isMarked && (
                                                    <span className="cp-dup-badge">{similar ? 'лучшая' : 'старая'}</span>
                                                )}
                                                <div className="cp-dup-item-meta">
                                                    <span className="cp-dup-item-coll">{it.collectionName}</span>
                                                    {similar ? (
                                                        <>
                                                            <span>{it.width}×{it.height} · {fmtSize(it.size)}</span>
                                                            <span>сходство {it.similarity}%</span>
                                                        </>
                                                    ) : (
                                                        <span>{fmtDate(it.importedAt)}</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="cp-dup-actions">
                        <button className="btn btn-outline-secondary btn-sm" disabled={!groups.length} onClick={() => applyMarks(planMarks(groups))}>
                            Отметить лишние
                        </button>
                        {chosen && (
                            <button
                                className="btn btn-outline-secondary btn-sm cp-dup-chosen"
                                title={`Отметить копии из «${chosen.name}». Если вся группа лежит там, одна копия останется.`}
                                disabled={!groups.length}
                                onClick={() => applyMarks(planMarks(groups, collection))}
                            >
                                Отметить в «{chosen.name}»
                            </button>
                        )}
                        <button className="btn btn-outline-secondary btn-sm" disabled={!marked.length} onClick={() => clearMarks(groups)}>
                            Снять все
                        </button>
                        <span className="cp-dup-spacer" />
                        {emptied > 0 && (
                            <span className="cp-dup-warn" title="В этих группах отмечены все копии">
                                <i className="bi bi-exclamation-triangle-fill me-1" />Без копии останется групп: {emptied}
                            </span>
                        )}
                        <span className="cp-dup-selcount">Отмечено в корзину: <b>{marked.length}</b></span>
                        <button
                            className="btn btn-danger btn-sm"
                            onClick={trashSelected}
                            disabled={!marked.length || busy}
                        >
                            <i className="bi bi-trash me-1" />
                            {busy ? 'Удаляю…' : `В корзину (${marked.length})`}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default DuplicatesTab;
