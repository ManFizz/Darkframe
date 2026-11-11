import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {openCompare} from '../Compare/CompareView';
import MediaPeek from '../Compare/MediaPeek';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {appUrl, ipcRenderer} from '@/Infrastructure/electron';
import {autotagApi} from '@/Infrastructure/Ipc';
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

// Four finders in one tab:
//   exact   — byte-identical files (content hash); the oldest copy is kept by default
//   similar — perceptual hash of the picture and its mirror: re-compressed / resized /
//             lightly edited / mirrored copies
//   content — vectors from the local tagger model: crops, edits, variations of one art;
//             optionally only what keypoints confirm as the same picture
//   video   — frame hashes across the video: re-encoded copies and cuts
// In the fuzzy modes the best-quality copy (most pixels, then biggest file) comes first.
const MODES = [
    { id: 'exact',   label: 'Точные' },
    { id: 'similar', label: 'Похожие',      kind: 'images' },
    { id: 'content', label: 'По содержанию', kind: 'content' },
    { id: 'video',   label: 'Видео',        kind: 'videos' },
];

const DESCRIPTIONS = {
    exact: 'Точные копии по содержимому файла (хеш). Оставь нужные, лишние — в корзину.',
    similar: 'Визуально похожие изображения: пережатые, уменьшенные, слегка изменённые и отзеркаленные копии.',
    content: 'Похожие по содержанию: обрезки, правки, подписи, вариации одного арта. Считается локальной моделью автотегов.',
    video: 'Похожие видео: пережатые, уменьшенные копии и вырезанные из длинного куски.',
};

const NOTHING_FOUND = {
    exact: 'Дубликатов не найдено',
    similar: 'Похожих изображений не найдено',
    content: 'Похожих по содержанию не найдено',
    video: 'Похожих видео не найдено',
};

// Fingerprint kinds: what they're computed for and how to start / follow it.
const KINDS = {
    images:  { what: 'изображений', noun: 'Отпечатки', compute: () => LibraryService.computePhashes(), progress: 'library:phashProgress' },
    videos:  { what: 'видео',       noun: 'Отпечатки', compute: () => LibraryService.computeVideoHashes(), progress: 'library:fingerprintProgress:videos', perItem: 0.7 },
    content: { what: 'изображений', noun: 'Векторы',   compute: () => LibraryService.computeEmbeddings(), progress: 'library:fingerprintProgress:content', perItem: 0.1 },
};

const fmtEta = (sec) => (sec < 90 ? `~${Math.max(1, Math.round(sec))} с` : sec < 5400 ? `~${Math.round(sec / 60)} мин` : `~${(sec / 3600).toFixed(1)} ч`);
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

const DuplicatesTab = () => {
    const [mode, setMode] = useState('exact');
    const [data, setData] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [scanPct, setScanPct] = useState(null);       // number, or { stage, pct } for content
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(() => new Set());
    const [busy, setBusy] = useState(false);
    const [peek, setPeek] = useState(null);   // { items, index }: full-size look (right click)

    // Fuzzy-mode state
    const [status, setStatus] = useState(null);         // { images, videos, content }: { total, missing, running, model? }
    const [progress, setProgress] = useState({});       // kind → { done, total } while computing
    const [distance, setDistance] = useState(DEFAULT_DISTANCE);
    const [mirror, setMirror] = useState(true);
    const [videoDistance, setVideoDistance] = useState(10);
    const [threshold, setThreshold] = useState(92);     // content: minimal cosine, %
    const [verify, setVerify] = useState(false);
    const [modelDl, setModelDl] = useState(null);       // { done, total } while the model downloads
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const setFilter = useCallback((key, value) => setFilters(prev => ({ ...prev, [key]: value })), []);

    const kind = MODES.find(m => m.id === mode)?.kind;

    useIpcProgress(KINDS.images.progress, useCallback(p => setProgress(prev => ({ ...prev, images: p && p.done < p.total ? p : null })), []));
    useIpcProgress(KINDS.videos.progress, useCallback(p => setProgress(prev => ({ ...prev, videos: p && p.done < p.total ? p : null })), []));
    useIpcProgress(KINDS.content.progress, useCallback(p => setProgress(prev => ({ ...prev, content: p && p.done < p.total ? p : null })), []));
    useIpcProgress('library:similarProgress', useCallback(p => setScanPct(p), []));
    useIpcProgress('library:contentProgress', useCallback(p => setScanPct(p), []));
    useIpcProgress('autotag:downloadProgress', useCallback(p => setModelDl(p), []));

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
            applyResult(mode === 'exact' ? await LibraryService.findDuplicates()
                : mode === 'similar' ? await LibraryService.findSimilar(distance, mirror)
                : mode === 'video' ? await LibraryService.findSimilarVideos(videoDistance)
                : await LibraryService.findByContent(threshold / 100, verify));
        } catch (e) {
            setError(e.message);
        } finally {
            setScanning(false);
            setScanPct(null);
        }
    }, [mode, distance, mirror, videoDistance, threshold, verify, applyResult]);

    const refreshStatus = useCallback(async () => {
        try { setStatus(await LibraryService.fingerprintStatus()); } catch { /* ignore */ }
    }, []);

    // Exact mode scans right away (cheap); the others first show the fingerprint status.
    useEffect(() => {
        setData(null);
        setSelected(new Set());
        if (mode === 'exact') scan();
        else refreshStatus();
    }, [mode]);   // eslint-disable-line react-hooks/exhaustive-deps

    // A computation started earlier (or elsewhere) is still running: follow it.
    const running = kind && (progress[kind] || status?.[kind]?.running);
    useEffect(() => {
        if (!running) return undefined;
        const t = setInterval(refreshStatus, 3000);
        return () => clearInterval(t);
    }, [running, refreshStatus]);

    const compute = useCallback(async (k) => {
        setProgress(prev => ({ ...prev, [k]: { done: 0, total: status?.[k]?.missing || 0 } }));
        try {
            const res = await KINDS[k].compute();
            if (res?.failed) notify({ message: `Не удалось обработать: ${res.failed}`, type: 'warning' });
        } catch (e) {
            notify({ message: `Ошибка: ${e.message}`, type: 'danger' });
        } finally {
            setProgress(prev => ({ ...prev, [k]: null }));
            refreshStatus();
        }
    }, [status, refreshStatus]);

    const stop = useCallback((k) => LibraryService.cancelFingerprints(k), []);

    const downloadModel = useCallback(async () => {
        setModelDl({ done: 0, total: 0 });
        try { await autotagApi.download(); }
        catch (e) { notify({ message: `Модель не скачалась: ${e.message}`, type: 'danger' }); }
        finally { setModelDl(null); refreshStatus(); }
    }, [refreshStatus]);

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

    const similar = mode !== 'exact';   // any of the fuzzy finders
    const st = kind ? status?.[kind] : null;
    const computed = st ? st.total - st.missing : 0;
    const prog = kind ? progress[kind] : null;
    const scanLabel = scanPct == null ? '…'
        : typeof scanPct === 'number' ? ` ${scanPct}%`
        : scanPct.stage === 'verify' ? `: проверяю точки ${scanPct.pct}%` : ` ${scanPct.pct}%`;

    // Type applies to exact copies only (the similar search is images only), resolution
    // to similar ones only (exact copies share it). A collection emptied by a cleanup
    // falls back to "all".
    const collections = useMemo(() => collectionOptions(data?.groups || []), [data]);
    const collection = collections.some(c => c.id === filters.collection) ? filters.collection : 'all';
    const groups = useMemo(() => filterGroups(data?.groups || [], {
        ...filters,
        collection,
        type: mode === 'exact' ? filters.type : 'all',
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
                    <p className="cp-manage-desc">{DESCRIPTIONS[mode]}</p>
                </div>
                <div className="cp-seg">
                    {MODES.map(m => (
                        <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
                    ))}
                </div>
            </div>

            {kind && st && (
                <div className="cp-sim-controls">
                    <div className="cp-sim-status">
                        {kind === 'content' && !st.model ? (
                            modelDl ? (
                                <>
                                    <span>Скачиваю модель: {Math.round((modelDl.done || 0) / 1048576)} / {Math.round((modelDl.total || 0) / 1048576) || '…'} МБ</span>
                                    <div className="progress" style={{ height: 6 }}>
                                        <div className="progress-bar" style={{ width: `${modelDl.total ? (modelDl.done / modelDl.total) * 100 : 0}%` }} />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <span>Нужна модель автотегов (WD ViT Tagger, ~380 МБ, работает локально)</span>
                                    <button className="btn btn-sm btn-outline-primary" onClick={downloadModel}>
                                        <i className="bi bi-download me-1" />Скачать модель
                                    </button>
                                </>
                            )
                        ) : running ? (
                            <>
                                <span>
                                    {KINDS[kind].noun}: {prog ? <>{prog.done} / {prog.total}</> : 'считаются…'}
                                    {prog && KINDS[kind].perItem && prog.total > prog.done && <> · осталось {fmtEta((prog.total - prog.done) * KINDS[kind].perItem)}</>}
                                </span>
                                <div className="progress" style={{ height: 6 }}>
                                    <div className="progress-bar" style={{ width: `${prog?.total ? (prog.done / prog.total) * 100 : 0}%` }} />
                                </div>
                                {kind !== 'images' && (
                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => stop(kind)} title="Посчитанное сохранится, продолжить можно позже">
                                        <i className="bi bi-stop-fill me-1" />Остановить
                                    </button>
                                )}
                            </>
                        ) : st.missing > 0 ? (
                            <>
                                <span>
                                    {KINDS[kind].noun} посчитаны для <b>{computed}</b> из <b>{st.total}</b> {KINDS[kind].what}
                                    {KINDS[kind].perItem && <> · ещё {fmtEta(st.missing * KINDS[kind].perItem)}</>}
                                </span>
                                <button className="btn btn-sm btn-outline-primary" onClick={() => compute(kind)}>
                                    <i className="bi bi-fingerprint me-1" />Посчитать {st.missing}
                                </button>
                            </>
                        ) : (
                            <span><i className="bi bi-check2-circle me-1" />{KINDS[kind].noun} готовы для всех {st.total} {KINDS[kind].what}</span>
                        )}
                    </div>

                    {mode === 'similar' && (
                        <>
                            <label className="cp-sim-threshold">
                                <span>Строго</span>
                                <input type="range" min={2} max={16} step={1} value={distance}
                                       onChange={e => setDistance(Number(e.target.value))} />
                                <span>Мягко</span>
                                <b>≈ {similarityOf(distance)}%</b>
                            </label>
                            <label className="form-check form-switch cp-dup-switch" title="Находить и отзеркаленные копии">
                                <input className="form-check-input" type="checkbox" checked={mirror} onChange={e => setMirror(e.target.checked)} />
                                <span>Отражения</span>
                            </label>
                        </>
                    )}
                    {mode === 'video' && (
                        <label className="cp-sim-threshold">
                            <span>Строго</span>
                            <input type="range" min={4} max={20} step={1} value={videoDistance}
                                   onChange={e => setVideoDistance(Number(e.target.value))} />
                            <span>Мягко</span>
                            <b>≈ {similarityOf(videoDistance)}%</b>
                        </label>
                    )}
                    {mode === 'content' && (
                        <>
                            <label className="cp-sim-threshold" title="Насколько близко по содержанию. Ниже — больше вариаций и ложных совпадений">
                                <span>Мягко</span>
                                <input type="range" min={80} max={99} step={1} value={threshold}
                                       onChange={e => setThreshold(Number(e.target.value))} />
                                <span>Строго</span>
                                <b>≥ {threshold}%</b>
                            </label>
                            <label className="form-check form-switch cp-dup-switch"
                                   title="Оставить только пары, где совпадают ключевые точки: обрезки, отражения, правки одной картинки. Отсеивает просто похожие арты. Медленнее.">
                                <input className="form-check-input" type="checkbox" checked={verify} onChange={e => setVerify(e.target.checked)} />
                                <span>Только та же картинка</span>
                            </label>
                        </>
                    )}

                    <button
                        className="btn btn-sm btn-primary"
                        onClick={scan}
                        disabled={scanning || !!running || !computed}
                        title={st.missing ? `Сравниваются только ${KINDS[kind].what} с посчитанными отпечатками` : ''}
                    >
                        <i className={`bi ${scanning ? 'bi-arrow-repeat spin' : 'bi-search'} me-1`} />
                        {scanning ? `Сравниваю${scanLabel}` : 'Найти похожие'}
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
            {peek && <MediaPeek items={peek.items} index={peek.index} onClose={() => setPeek(null)} />}

            {data && !scanning && data.totalGroups === 0 && (
                <div className="cp-empty">
                    <i className="bi bi-check2-circle" />
                    <span>{NOTHING_FOUND[mode]}</span>
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
                        {mode === 'exact' && (
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
                                    <button className="cp-linkbtn"
                                            title={group.items.length > 2
                                                ? 'Сравнить бок о бок: сначала первые две, пару можно сменить в окне сравнения'
                                                : 'Сравнить бок о бок'}
                                            onClick={() => {
                                                const pool = group.items.map(it => ({
                                                    ...it, url: appUrl(`library://item/${it.id}`), thumb: it.thumbPath,
                                                }));
                                                // Only marks: the trash is the button at the bottom.
                                                openCompare(pool.slice(0, 2), {
                                                    pool,
                                                    onKeep: (keepIt, dropIt) => applyMarks({ mark: [dropIt.id], unmark: [keepIt.id] }),
                                                });
                                            }}>
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
                                                onContextMenu={e => {
                                                    e.preventDefault();
                                                    setPeek({ index: i, items: group.items.map(x => ({ ...x, url: appUrl(`library://item/${x.id}`) })) });
                                                }}
                                                title={`${it.title}\nПКМ — открыть целиком`}
                                            >
                                                <img src={it.thumbPath} alt={it.title} loading="lazy" draggable={false} />
                                                <div className="cp-dup-item-overlay">
                                                    <i className={`bi ${isMarked ? 'bi-trash3-fill' : 'bi-check-circle'}`} />
                                                </div>
                                                {i === 0 && !isMarked && (
                                                    <span className="cp-dup-badge">{similar ? 'лучшая' : 'старая'}</span>
                                                )}
                                                <div className="cp-dup-item-meta">
                                                    <span className="cp-dup-item-coll">{group.items.length > 2 && <>{i + 1}. </>}{it.collectionName}</span>
                                                    {similar ? (
                                                        <>
                                                            <span>{it.width}×{it.height}{it.duration ? ` · ${fmtDur(it.duration)}` : ''} · {fmtSize(it.size)}</span>
                                                            <span>сходство {it.similarity}%{it.mirrored ? ' · отражение' : ''}</span>
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
