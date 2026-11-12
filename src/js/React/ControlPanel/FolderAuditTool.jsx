import React, {useCallback, useEffect, useState} from 'react';
import {fsApi, invoke} from '@/Infrastructure/Ipc';
import {ipcRenderer} from '@/Infrastructure/electron';
import {notify} from '@services/NotificationService';

const fmtSize = (bytes) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes || 0, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i > 0 && n < 100 ? 1 : 0)} ${units[i]}`;
};

const SHOWN = 300;

// Settings → Management → Folder check: which files of a disk folder aren't in
// the library yet. Nothing is imported unless asked.
const FolderAuditTool = () => {
    const [dir, setDir] = useState(null);
    const [report, setReport] = useState(null);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        const onProgress = (_, p) => setProgress(p);
        ipcRenderer.on('fs:auditProgress', onProgress);
        return () => {
            ipcRenderer.removeListener('fs:auditProgress', onProgress);
            ipcRenderer.send('fs:auditCancel');
        };
    }, []);

    const run = useCallback(async (folder) => {
        setDir(folder);
        setReport(null);
        setError(null);
        setProgress({ done: 0, total: 0 });
        try {
            const res = await fsApi.audit(folder);
            if (res.canceled) return;
            if (!res.ok) setError(res.error);
            else setReport(res);
        } finally {
            setProgress(null);
        }
    }, []);

    const pick = useCallback(async () => {
        const folder = await fsApi.auditPick();
        if (folder) run(folder);
    }, [run]);

    const importMissing = useCallback(async () => {
        if (!report?.missing.length) return;
        if (!confirm(`Импортировать в библиотеку файлов: ${report.missing.length}?`)) return;
        setImporting(true);
        try {
            const res = await invoke('library:importFiles', { filePaths: report.missing.map(m => m.path) });
            notify({ message: `Импортировано: ${res?.results?.length ?? 0}`, type: 'success' });
            await run(dir);
        } catch (e) {
            notify({ message: `Не удалось: ${e.message}`, type: 'danger' });
        } finally {
            setImporting(false);
        }
    }, [report, dir, run]);

    const copyList = useCallback(async () => {
        await navigator.clipboard.writeText(report.missing.map(m => m.path).join('\n'));
        notify({ message: 'Список скопирован', type: 'success' });
    }, [report]);

    const scanning = !!progress;
    const missingBytes = report ? report.missing.reduce((s, m) => s + m.size, 0) : 0;

    return (
        <div className="settings-body cp-manage">
            <div className="cp-manage-head">
                <div>
                    <h3>Проверка папки</h3>
                    <p className="cp-manage-desc">
                        Какие файлы из папки (с подпапками) ещё не импортированы. Сравнение по содержимому,
                        ничего не добавляется и не меняется.
                    </p>
                </div>
                <div className="d-flex gap-2">
                    {dir && !scanning && (
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => run(dir)}>
                            <i aria-hidden="true" className="bi bi-arrow-repeat me-1" />Снова
                        </button>
                    )}
                    <button className="btn btn-outline-secondary btn-sm" onClick={pick} disabled={scanning || importing}>
                        <i aria-hidden="true" className="bi bi-folder2-open me-1" />Выбрать папку
                    </button>
                </div>
            </div>

            {dir && <div className="cp-manage-desc mb-2" title={dir}>{dir}</div>}
            {error && <div className="settings-error">{error}</div>}

            {scanning && (
                <div className="cp-empty">
                    <i aria-hidden="true" className="bi bi-arrow-repeat spin" />
                    <span>
                        {progress.total ? `Проверяю: ${progress.done} из ${progress.total}` : 'Просматриваю папку…'}
                    </span>
                </div>
            )}

            {report && (
                <>
                    <div className="cp-manage-desc mb-2">
                        Подходящих файлов: <b>{report.total}</b> · уже в библиотеке: <b>{report.inLibrary}</b>
                        {report.trashed > 0 && <> · в корзине: <b>{report.trashed}</b></>}
                        {' '}· не импортировано: <b>{report.missing.length}</b> ({fmtSize(missingBytes)})
                    </div>

                    {report.missing.length === 0 ? (
                        <div className="cp-empty">
                            <i aria-hidden="true" className="bi bi-check-circle" />
                            <span>Всё из этой папки уже в библиотеке</span>
                        </div>
                    ) : (
                        <section className="cp-intg-section">
                            <div className="cp-intg-head">
                                <span><b>{report.missing.length}</b> не в библиотеке</span>
                                <span className="d-flex gap-2">
                                    <button className="btn btn-sm btn-outline-secondary" onClick={copyList}>
                                        <i aria-hidden="true" className="bi bi-clipboard me-1" />Копировать список
                                    </button>
                                    <button className="btn btn-sm btn-primary" onClick={importMissing} disabled={importing}>
                                        <i aria-hidden="true" className={`bi me-1 ${importing ? 'bi-arrow-repeat spin' : 'bi-download'}`} />
                                        Импортировать
                                    </button>
                                </span>
                            </div>
                            <div className="cp-intg-list">
                                {report.missing.slice(0, SHOWN).map(m => (
                                    <div
                                        key={m.path} className="cp-intg-row" role="button"
                                        title={`${m.path}\nКлик — показать в проводнике`}
                                        onClick={() => fsApi.reveal(m.path)}
                                    >
                                        <i aria-hidden="true" className="bi bi-file-earmark" />
                                        <span className="cp-intg-name">{m.path.slice(dir.length).replace(/^[\/]/, '')}</span>
                                        {m.copies > 0 && <span className="cp-intg-tag">копий в папке: {m.copies}</span>}
                                        <span className="cp-intg-size">{fmtSize(m.size)}</span>
                                    </div>
                                ))}
                                {report.missing.length > SHOWN && (
                                    <div className="cp-intg-more">…и ещё {report.missing.length - SHOWN}</div>
                                )}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
};

export default FolderAuditTool;
