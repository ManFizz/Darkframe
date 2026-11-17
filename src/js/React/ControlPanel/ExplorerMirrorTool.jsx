import React, {useEffect, useState} from 'react';
import {explorerMirrorApi} from '@/Infrastructure/Ipc';
import {notify} from '@services/NotificationService';

const fmtTime = (t) => (t ? new Date(t).toLocaleString() : '—');

// The library as an ordinary folder in Explorer: collections as folders, media as
// hard links to the library's files (no extra space). Rebuilt after every change.
const ExplorerMirrorTool = () => {
    const [st, setSt] = useState(null);
    const [busy, setBusy] = useState(false);
    const [confirmOff, setConfirmOff] = useState(false);

    useEffect(() => {
        explorerMirrorApi.status().then(setSt);
        return explorerMirrorApi.onStatus(setSt);
    }, []);

    const act = async (fn, ok) => {
        setBusy(true);
        try {
            const res = await fn();
            if (res && typeof res === 'object' && 'enabled' in res) setSt(res);
            if (ok) notify({ message: ok, type: 'success' });
        } catch (e) {
            notify({ message: String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), type: 'danger' });
        } finally {
            setBusy(false);
            explorerMirrorApi.status().then(setSt);
        }
    };

    if (!st) return <div className="settings-body cp-manage" />;

    const choose = async () => {
        const dir = await explorerMirrorApi.pick();
        if (!dir) return;
        if (st.enabled) act(() => explorerMirrorApi.set({ enabled: true, path: dir }), 'Папка перенесена');
        else setSt({ ...st, path: dir });
    };
    const turnOn = () => act(() => explorerMirrorApi.set({ enabled: true, path: st.path }), 'Папка библиотеки создана');
    const turnOff = () => { setConfirmOff(false); act(() => explorerMirrorApi.set({ enabled: false, path: st.path }), 'Папка убрана'); };

    const working = busy || st.running;
    const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;

    return (
        <div className="settings-body cp-manage">
            <div className="cp-manage-head">
                <div>
                    <h3>Папка в проводнике</h3>
                    <p className="cp-manage-desc">
                        Вся библиотека как обычная папка Windows: коллекции — папки, медиа — файлы с понятными именами.
                        Это жёсткие ссылки на файлы библиотеки, поэтому место на диске не занимается.
                        Папка обновляется сама после любых изменений в приложении.
                    </p>
                </div>
                {st.enabled && (
                    <button className="btn btn-primary btn-sm" onClick={() => act(explorerMirrorApi.open)}>
                        <i aria-hidden="true" className="bi bi-folder2-open me-1" /> Открыть в проводнике
                    </button>
                )}
            </div>

            <div className={`wf-card ${st.enabled ? '' : 'off'}`}>
                <div className="wf-head">
                    <div className="form-check form-switch ar-switch" title={st.enabled ? 'Убрать папку' : 'Создать папку'}>
                        <input className="form-check-input" type="checkbox" checked={st.enabled} disabled={working}
                               onChange={() => (st.enabled ? setConfirmOff(true) : turnOn())} />
                    </div>
                    <i aria-hidden="true" className="bi bi-folder-symlink wf-icon" />
                    <div className="wf-path" title={st.path}><bdi>{st.path}</bdi></div>
                    <button className="btn btn-sm btn-outline-secondary" disabled={working} onClick={choose}>
                        <i aria-hidden="true" className="bi bi-pencil me-1" /> Другая папка
                    </button>
                </div>

                <div className="em-stats">
                    {st.running ? (
                        <span><i aria-hidden="true" className="bi bi-arrow-repeat spin me-1" />Обновляю… {st.total ? `${st.done} / ${st.total} (${pct}%)` : ''}</span>
                    ) : st.enabled ? (
                        <>
                            <span><i aria-hidden="true" className="bi bi-files me-1" />Файлов: <b>{st.files}</b></span>
                            <span>Обновлено: {fmtTime(st.lastSync)}</span>
                            {st.missing > 0 && <span className="text-warning" title="У этих медиа нет файла в папке библиотеки (см. «Целостность»)">Без файла: {st.missing}</span>}
                            {st.failed > 0 && <span className="text-warning" title="Скорее всего, открыты в другой программе; повторю при следующем обновлении">Не получилось: {st.failed}</span>}
                        </>
                    ) : (
                        <span className="text-muted">Выключено. Папка должна быть на том же диске, что и библиотека.</span>
                    )}
                    {st.lastError && <span className="text-danger"><i aria-hidden="true" className="bi bi-exclamation-triangle me-1" />{st.lastError}</span>}
                </div>

                <div className="wf-foot">
                    {confirmOff ? (
                        <span className="ar-confirm">
                            Убрать папку? Удалятся только ссылки, файлы библиотеки останутся.
                            <button className="btn btn-sm btn-danger" onClick={turnOff}>Убрать</button>
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => setConfirmOff(false)}>Нет</button>
                        </span>
                    ) : (
                        <>
                            <span className="em-note">
                                Только для просмотра: переименования и переносы в проводнике в библиотеку не попадут.
                                Если отредактировать файл и сохранить поверх, изменится и файл в библиотеке.
                            </span>
                            <span className="wf-spacer" />
                            {st.enabled && (
                                <button className="btn btn-sm btn-outline-secondary" disabled={working}
                                        onClick={() => act(explorerMirrorApi.sync, 'Папка обновлена')}
                                        title="Пересобрать и проверить все ссылки">
                                    <i aria-hidden="true" className="bi bi-arrow-repeat me-1" /> Обновить сейчас
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExplorerMirrorTool;
