import React, {useCallback, useEffect, useState} from 'react';
import {openCompare} from '../Compare/CompareView';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {ipcRenderer} from '@/Infrastructure/electron';

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

// Listen to a main-process progress channel while mounted.
function useIpcProgress(channel, onValue) {
    useEffect(() => {
        const h = (_, v) => onValue(v);
        ipcRenderer.on(channel, h);
        return () => ipcRenderer.removeListener(channel, h);
    }, [channel, onValue]);
}

// Two finders in one tab:
//   Точные  — byte-identical files (content hash); the oldest copy is kept by default
//   Похожие — perceptual hash: re-compressed / resized / lightly edited copies; the
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

    useIpcProgress('library:phashProgress', useCallback(p => setHashing(p), []));
    useIpcProgress('library:similarProgress', useCallback(p => setScanPct(p), []));

    const applyResult = useCallback((res) => {
        setData(res);
        // Keep the first item of each group (oldest / best), pre-select the rest.
        const preselect = new Set();
        for (const g of res.groups) g.items.slice(1).forEach(it => preselect.add(it.id));
        setSelected(preselect);
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

    const trashSelected = useCallback(async () => {
        if (!selected.size || busy) return;
        setBusy(true);
        try {
            const ids = [...selected];
            await LibraryService.deleteItems(ids, false);
            notify({ message: `В корзину отправлено: ${ids.length}`, type: 'success' });
            await scan();
        } catch (e) {
            notify({ message: `Не удалось: ${e.message}`, type: 'danger' });
        } finally {
            setBusy(false);
        }
    }, [selected, busy, scan]);

    const similar = mode === 'similar';
    const hashesReady = status && status.missing === 0;

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
                    <div className="cp-dup-summary">
                        Групп: <b>{data.totalGroups}</b> · файлов: <b>{data.totalItems}</b> ·
                        можно освободить до <b>{fmtSize(data.reclaimable)}</b>
                    </div>

                    <div className="cp-dup-groups">
                        {data.groups.map(group => (
                            <div key={group.hash} className="cp-dup-group">
                                <div className="cp-dup-group-head">
                                    <span>
                                        {group.items.length} {similar ? 'похожих' : 'копии'}
                                        {!similar && <> · {fmtSize(group.items[0].size)}</>}
                                    </span>
                                    <button className="cp-linkbtn" title="Сравнить первые два бок о бок"
                                            onClick={() => openCompare(group.items.slice(0, 2).map(it => ({
                                                ...it, url: `library://item/${it.id}`,
                                            })), { onDone: scan })}>
                                        <i className="bi bi-layout-split" /> Сравнить
                                    </button>
                                    <button className="cp-linkbtn" onClick={() => keepFirst(group)}>
                                        {similar ? 'Оставить только лучшую' : 'Оставить только старую'}
                                    </button>
                                </div>
                                <div className="cp-dup-items">
                                    {group.items.map((it, i) => {
                                        const marked = selected.has(it.id);
                                        return (
                                            <div
                                                key={it.id}
                                                className={`cp-dup-item ${marked ? 'marked' : ''}`}
                                                onClick={() => toggle(it.id)}
                                                title={it.title}
                                            >
                                                <img src={it.thumbPath} alt={it.title} loading="lazy" draggable={false} />
                                                <div className="cp-dup-item-overlay">
                                                    <i className={`bi ${marked ? 'bi-trash3-fill' : 'bi-check-circle'}`} />
                                                </div>
                                                {i === 0 && !marked && (
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
                        <span className="cp-dup-selcount">Отмечено в корзину: <b>{selected.size}</b></span>
                        <button
                            className="btn btn-danger btn-sm"
                            onClick={trashSelected}
                            disabled={!selected.size || busy}
                        >
                            <i className="bi bi-trash me-1" />
                            {busy ? 'Удаляю…' : `В корзину (${selected.size})`}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default DuplicatesTab;
