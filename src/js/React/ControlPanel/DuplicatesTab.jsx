import React, {useCallback, useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';

const fmtSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i > 0 && n < 100 ? 1 : 0)} ${units[i]}`;
};

const fmtDate = (t) => (t ? new Date(t * 1000).toLocaleDateString('ru-RU') : '—');

const DuplicatesTab = () => {
    const [data, setData] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(() => new Set());
    const [busy, setBusy] = useState(false);

    const scan = useCallback(async () => {
        setScanning(true);
        setError(null);
        try {
            const res = await LibraryService.findDuplicates();
            setData(res);
            // Sensible default: keep the oldest copy in each group, pre-select the rest.
            const preselect = new Set();
            for (const g of res.groups) {
                g.items.slice(1).forEach(it => preselect.add(it.id));
            }
            setSelected(preselect);
        } catch (e) {
            setError(e.message);
        } finally {
            setScanning(false);
        }
    }, []);

    useEffect(() => { scan(); }, [scan]);

    const toggle = useCallback((id) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const keepOldest = useCallback((group) => {
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

    return (
        <div className="settings-body cp-manage">
            <div className="cp-manage-head">
                <div>
                    <h3>Поиск дубликатов</h3>
                    <p className="cp-manage-desc">
                        Точные копии по содержимому файла (хеш). Оставь нужные, лишние — в корзину.
                    </p>
                </div>
                <button className="btn btn-outline-secondary btn-sm" onClick={scan} disabled={scanning}>
                    <i className={`bi bi-arrow-repeat me-1 ${scanning ? 'spin' : ''}`} />
                    {scanning ? 'Сканирую…' : 'Пересканировать'}
                </button>
            </div>

            {error && <div className="settings-error">{error}</div>}

            {data && !scanning && data.totalGroups === 0 && (
                <div className="cp-empty">
                    <i className="bi bi-check2-circle" />
                    <span>Дубликатов не найдено</span>
                </div>
            )}

            {data && data.totalGroups > 0 && (
                <>
                    <div className="cp-dup-summary">
                        Групп: <b>{data.totalGroups}</b> · копий: <b>{data.totalItems}</b> ·
                        можно освободить до <b>{fmtSize(data.reclaimable)}</b>
                    </div>

                    <div className="cp-dup-groups">
                        {data.groups.map(group => (
                            <div key={group.hash} className="cp-dup-group">
                                <div className="cp-dup-group-head">
                                    <span>{group.items.length} копии · {fmtSize(group.items[0].size)}</span>
                                    <button className="cp-linkbtn" onClick={() => keepOldest(group)}>
                                        Оставить только старую
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
                                                {i === 0 && !marked && <span className="cp-dup-badge">старая</span>}
                                                <div className="cp-dup-item-meta">
                                                    <span className="cp-dup-item-coll">{it.collectionName}</span>
                                                    <span>{fmtDate(it.importedAt)}</span>
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
