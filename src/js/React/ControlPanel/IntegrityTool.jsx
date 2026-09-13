import React, {useCallback, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';

const fmtSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i > 0 && n < 100 ? 1 : 0)} ${units[i]}`;
};

const IntegrityTool = () => {
    const [report, setReport] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const scan = useCallback(async () => {
        setScanning(true);
        setError(null);
        try {
            setReport(await LibraryService.checkIntegrity());
        } catch (e) {
            setError(e.message);
        } finally {
            setScanning(false);
        }
    }, []);

    const cleanup = useCallback(async ({ records, folders }) => {
        if (!report) return;
        const missingIds  = records ? report.missing.map(m => m.id) : [];
        const orphanNames = folders ? report.orphans.map(o => o.name) : [];
        if (!missingIds.length && !orphanNames.length) return;

        const parts = [];
        if (missingIds.length)  parts.push(`записей без файла: ${missingIds.length}`);
        if (orphanNames.length) parts.push(`папок-сирот: ${orphanNames.length}`);
        if (!confirm(`Удалить ${parts.join(' и ')}? Действие необратимо.`)) return;

        setBusy(true);
        try {
            const res = await LibraryService.cleanupIntegrity(missingIds, orphanNames);
            notify({
                message: `Очищено — записей: ${res.records}, папок: ${res.folders}`,
                type: 'success',
            });
            await scan();
        } catch (e) {
            notify({ message: `Не удалось: ${e.message}`, type: 'danger' });
        } finally {
            setBusy(false);
        }
    }, [report, scan]);

    const clean = report && report.missing.length === 0 && report.orphans.length === 0;

    return (
        <div className="settings-body cp-manage">
            <div className="cp-manage-head">
                <div>
                    <h3>Проверка целостности</h3>
                    <p className="cp-manage-desc">
                        Записи в базе без файла на диске и папки-сироты без записи в базе.
                    </p>
                </div>
                <button className="btn btn-outline-secondary btn-sm" onClick={scan} disabled={scanning || busy}>
                    <i className={`bi bi-arrow-repeat me-1 ${scanning ? 'spin' : ''}`} />
                    {scanning ? 'Проверяю…' : (report ? 'Проверить снова' : 'Проверить')}
                </button>
            </div>

            {error && <div className="settings-error">{error}</div>}

            {report && clean && (
                <div className="cp-empty">
                    <i className="bi bi-shield-check" />
                    <span>Всё в порядке — проблем не найдено</span>
                </div>
            )}

            {report && !clean && (
                <>
                    {report.missing.length > 0 && (
                        <section className="cp-intg-section">
                            <div className="cp-intg-head">
                                <span><b>{report.missing.length}</b> записей без файла</span>
                                <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => cleanup({ records: true })}
                                    disabled={busy}
                                >
                                    <i className="bi bi-trash3 me-1" />
                                    Удалить записи
                                </button>
                            </div>
                            <div className="cp-intg-list">
                                {report.missing.slice(0, 200).map(m => (
                                    <div key={m.id} className="cp-intg-row">
                                        <i className="bi bi-file-earmark-x" />
                                        <span className="cp-intg-name" title={m.fileName}>{m.title}</span>
                                        {m.trashed && <span className="cp-intg-tag">в корзине</span>}
                                    </div>
                                ))}
                                {report.missing.length > 200 && (
                                    <div className="cp-intg-more">…и ещё {report.missing.length - 200}</div>
                                )}
                            </div>
                        </section>
                    )}

                    {report.orphans.length > 0 && (
                        <section className="cp-intg-section">
                            <div className="cp-intg-head">
                                <span><b>{report.orphans.length}</b> папок-сирот · {fmtSize(report.orphanBytes)}</span>
                                <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => cleanup({ folders: true })}
                                    disabled={busy}
                                >
                                    <i className="bi bi-trash3 me-1" />
                                    Удалить папки
                                </button>
                            </div>
                            <div className="cp-intg-list">
                                {report.orphans.slice(0, 200).map(o => (
                                    <div key={o.name} className="cp-intg-row">
                                        <i className="bi bi-folder-x" />
                                        <span className="cp-intg-name" title={o.name}>{o.name}</span>
                                        <span className="cp-intg-size">{fmtSize(o.size)}</span>
                                    </div>
                                ))}
                                {report.orphans.length > 200 && (
                                    <div className="cp-intg-more">…и ещё {report.orphans.length - 200}</div>
                                )}
                            </div>
                        </section>
                    )}

                    {report.missing.length > 0 && report.orphans.length > 0 && (
                        <div className="cp-dup-actions">
                            <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => cleanup({ records: true, folders: true })}
                                disabled={busy}
                            >
                                <i className="bi bi-trash me-1" />
                                Удалить всё найденное
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default IntegrityTool;
