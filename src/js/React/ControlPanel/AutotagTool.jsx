import React, {useEffect, useState} from 'react';
import {autotagApi, libraryApi} from '@/Infrastructure/Ipc';
import {ipcRenderer} from '@/Infrastructure/electron';
import {notify} from '@services/NotificationService';
import {autotagItems} from '@services/autotagRun';

const fmtMB = (b) => `${Math.round(b / 1024 ** 2)} МБ`;

// Control panel → Управление → Автотеги: the local tagger model (download /
// remove), how sure it must be, and "tag everything that has no tags".
const AutotagTool = () => {
    const [st, setSt] = useState(null);
    const [dl, setDl] = useState(null);          // download progress
    const [untagged, setUntagged] = useState(null);
    const [run, setRun] = useState(null);        // tagging progress

    const refresh = async () => {
        setSt(await autotagApi.status());
        const { items } = await libraryApi.getItems({});
        setUntagged(items.filter(i => !i.tags?.length).map(i => i.id));
    };
    useEffect(() => { refresh(); }, []);

    const download = async () => {
        const handler = (_, p) => setDl(p);
        ipcRenderer.on('autotag:downloadProgress', handler);
        setDl({ done: 0, total: 0 });
        try {
            setSt(await autotagApi.download());
            notify({ message: 'Модель скачана — можно размечать', type: 'success' });
        } catch (e) {
            notify({ message: `Не удалось скачать: ${String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, type: 'warning', duration: 8000 });
        } finally {
            ipcRenderer.removeListener('autotag:downloadProgress', handler);
            setDl(null);
        }
    };

    const setThreshold = async (patch) => {
        const settings = await autotagApi.settings(patch);
        setSt(s => ({ ...s, settings }));
    };

    const tagUntagged = async () => {
        setRun({ done: 0, total: untagged.length });
        try { await autotagItems(untagged, { onProgress: setRun }); }
        finally { setRun(null); refresh(); }
    };

    if (!st) return <div className="settings-body cp-manage"><i className="bi bi-arrow-repeat spin" /></div>;
    const pct = dl?.total ? Math.round((dl.done / dl.total) * 100) : 0;

    return (
        <div className="settings-body cp-manage at-tool">
            <div className="cp-manage-head">
                <div>
                    <h3>Автотеги</h3>
                    <p className="cp-manage-desc">
                        Нейросеть {st.model} смотрит на картинку и предлагает теги (персонажи, одежда, фон, стиль…).
                        Работает на этом компьютере — файлы никуда не отправляются. Для видео берётся превью.
                    </p>
                </div>
            </div>

            <div className="at-card">
                <i className={`bi ${st.installed ? 'bi-cpu-fill' : 'bi-cloud-arrow-down'} at-card-icon`} />
                <div className="at-card-body">
                    <div className="at-card-title">{st.installed ? 'Модель установлена' : 'Модель не скачана'}</div>
                    <div className="at-card-sub">
                        {dl ? <>Скачиваю… {dl.total ? `${fmtMB(dl.done)} из ${fmtMB(dl.total)} (${pct}%)` : fmtMB(dl.done)}</>
                            : st.installed ? `${fmtMB(st.bytes)} · huggingface.co/SmilingWolf/wd-vit-tagger-v3`
                            : 'Около 380 МБ, один раз — с huggingface.co (SmilingWolf/wd-vit-tagger-v3)'}
                    </div>
                    {dl && <div className="at-bar"><span style={{ width: `${pct}%` }} /></div>}
                </div>
                {!st.installed && !dl && (
                    <button className="btn btn-sm btn-primary" onClick={download}><i className="bi bi-download me-1" />Скачать модель</button>
                )}
                {st.installed && (
                    <button className="btn btn-sm btn-outline-secondary" onClick={async () => setSt(await autotagApi.remove())}
                            title="Освободить место; скачать можно снова">
                        <i className="bi bi-trash3" />
                    </button>
                )}
            </div>

            <div className="at-thresholds">
                <label>
                    <span>Уверенность для обычных тегов: <b>{Math.round(st.settings.general * 100)}%</b></span>
                    <input type="range" min={0.2} max={0.9} step={0.05} value={st.settings.general}
                           onChange={e => setSt(s => ({ ...s, settings: { ...s.settings, general: Number(e.target.value) } }))}
                           onMouseUp={e => setThreshold({ general: Number(e.target.value) })} />
                    <em>ниже — больше тегов, но и больше ошибок</em>
                </label>
                <label>
                    <span>Уверенность для персонажей: <b>{Math.round(st.settings.character * 100)}%</b></span>
                    <input type="range" min={0.5} max={0.98} step={0.01} value={st.settings.character}
                           onChange={e => setSt(s => ({ ...s, settings: { ...s.settings, character: Number(e.target.value) } }))}
                           onMouseUp={e => setThreshold({ character: Number(e.target.value) })} />
                    <em>персонажи путаются чаще — порог выше</em>
                </label>
            </div>

            <div className="at-run">
                <div>
                    <b>Файлы без тегов: {untagged == null ? '…' : untagged.length}</b>
                    <div className="cp-manage-desc">Выделенные файлы можно разметить и из панели выделения («Автотеги»), а один файл — в просмотре.</div>
                </div>
                <button className="btn btn-sm btn-primary" disabled={!st.installed || !untagged?.length || !!run} onClick={tagUntagged}>
                    {run ? <><i className="bi bi-arrow-repeat spin me-1" />{run.done} / {run.total}</> : <><i className="bi bi-stars me-1" />Разметить</>}
                </button>
            </div>
        </div>
    );
};

export default AutotagTool;
