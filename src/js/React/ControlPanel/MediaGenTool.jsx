import React, {useCallback, useEffect, useRef, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';

// Background regeneration of missing thumbnails / dimensions (old imports that never
// got a thumb.jpg or whose width/height stayed 0). The main process does the work,
// streaming progress; closing the panel doesn't stop it.
const MediaGenTool = () => {
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(null);   // { done, total, fixed, failed }
    const [result, setResult] = useState(null);
    const runningRef = useRef(false);

    useEffect(() => {
        const { ipcRenderer } = window.require('electron');
        const handler = (_, p) => setProgress(p);
        ipcRenderer.on('library:maintenanceProgress', handler);
        return () => ipcRenderer.removeListener('library:maintenanceProgress', handler);
    }, []);

    const run = useCallback(async () => {
        if (runningRef.current) return;
        runningRef.current = true;
        setRunning(true);
        setResult(null);
        setProgress({ done: 0, total: 0, fixed: 0, failed: 0 });
        try {
            const res = await LibraryService.generateMissingMedia();
            setResult(res);
            notify({
                message: res.total === 0
                    ? 'Нечего генерировать — всё на месте'
                    : `Готово: превью ${res.fixed}${res.failed ? `, ошибок ${res.failed}` : ''}`,
                type: res.failed ? 'warning' : 'success',
            });
        } catch (e) {
            notify({ message: `Ошибка: ${e.message}`, type: 'danger' });
        } finally {
            runningRef.current = false;
            setRunning(false);
        }
    }, []);

    const pct = progress && progress.total
        ? Math.round((progress.done / progress.total) * 100)
        : 0;

    return (
        <div className="settings-body cp-manage">
            <div className="cp-manage-head">
                <div>
                    <h3>Превью и размеры</h3>
                    <p className="cp-manage-desc">
                        Досоздать недостающие миниатюры и разрешения (для старых импортов).
                        Идёт в фоне — панель можно закрыть.
                    </p>
                </div>
                <button className="btn btn-outline-primary btn-sm" onClick={run} disabled={running}>
                    <i className={`bi ${running ? 'bi-arrow-repeat spin' : 'bi-images'} me-1`} />
                    {running ? 'Генерирую…' : 'Сгенерировать недостающее'}
                </button>
            </div>

            {progress && (running || result) && (
                <div className="cp-gen-progress">
                    <div className="progress" style={{ height: 8 }}>
                        <div
                            className="progress-bar"
                            style={{ width: `${pct}%`, transition: 'width .2s' }}
                        />
                    </div>
                    <div className="cp-gen-stats">
                        <span>{progress.done} / {progress.total || '—'}</span>
                        <span>готово: <b>{progress.fixed}</b></span>
                        {progress.failed > 0 && <span className="cp-gen-fail">ошибок: {progress.failed}</span>}
                    </div>
                </div>
            )}

            {result && !running && result.total === 0 && (
                <div className="cp-empty">
                    <i className="bi bi-check2-circle" />
                    <span>Всё уже сгенерировано</span>
                </div>
            )}
        </div>
    );
};

export default MediaGenTool;
