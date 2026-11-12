import React, {useEffect, useState} from 'react';
import {fsApi} from '@/Infrastructure/Ipc';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import TagEditor from '../Library/Metadata/TagEditor';
import CollectionTreeSelect, {pushRecentCollection} from '../Library/Collection/CollectionTreeSelect';
import {useCollections} from '@hooks/library/useCollections';

const fmtSize = (b) => {
    if (b == null) return '—';
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} КБ`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} МБ`;
    return `${(b / 1024 ** 3).toFixed(2)} ГБ`;
};
const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtDuration = (s) => {
    if (!s) return null;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const KIND_LABEL = { image: 'Изображение', gif: 'Анимация GIF', video: 'Видео' };

// Remembered between files: people tend to file a run of pictures into one place.
let lastTarget = { collectionId: null, tags: [] };

// Side panel for a file opened from the Folders browser: what it is, where it is,
// and a one-click import into the library (collection + tags).
const FolderPanel = ({ file }) => {
    const [info, setInfo] = useState(null);
    const [picking, setPicking] = useState(false);
    const [target, setTarget] = useState(lastTarget);
    const [state, setState] = useState(null);   // null | 'busy' | { done, message }
    const [copied, setCopied] = useState(false);
    const { tree } = useCollections();

    useEffect(() => {
        let cancelled = false;
        setInfo(null);
        setState(null);
        fsApi.info(file.filePath).then(res => { if (!cancelled) setInfo(res?.ok ? res : { error: res?.error }); });
        return () => { cancelled = true; };
    }, [file.filePath]);

    useEffect(() => { lastTarget = target; }, [target]);

    const findName = (nodes, id) => {
        for (const n of nodes) {
            if (n.id === id) return n.name;
            const inner = findName(n.children || [], id);
            if (inner) return inner;
        }
        return null;
    };
    const targetName = target.collectionId ? (findName(tree, target.collectionId) || 'Коллекция') : 'Без коллекции';

    const copyPath = () => {
        navigator.clipboard.writeText(file.filePath).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
    };

    const doImport = async (allowDuplicate = false) => {
        setState('busy');
        try {
            const res = await LibraryService.importFiles({
                filePaths: [file.filePath],
                collectionId: target.collectionId,
                tags: target.tags,
                allowDuplicate,
            });
            pushRecentCollection(target.collectionId);
            if (res.results?.length) {
                setState({ done: true, message: `Добавлено в «${targetName}»` });
            } else if (res.skipped?.length) {
                const s = res.skipped[0];
                setState({
                    done: false,
                    duplicate: s.reason === 'duplicate',
                    message: s.reason === 'trashed'
                        ? 'Такой файл лежит в корзине библиотеки'
                        : `Уже есть в библиотеке — «${s.collectionName}»`,
                });
            } else {
                setState({ done: false, message: res.errors?.[0]?.error || 'Не удалось импортировать' });
            }
        } catch (e) {
            setState(null);
            notify({ message: `Импорт не удался: ${e.message}`, type: 'danger' });
        }
    };

    const rows = [
        ['Тип', `${KIND_LABEL[info?.kind] || 'Файл'}${info?.ext ? ` · ${info.ext.toUpperCase()}` : ''}`],
        info?.width ? ['Разрешение', `${info.width} × ${info.height}${info.frames > 1 ? ` · ${info.frames} кадров` : ''}`] : null,
        info?.width ? ['Мегапиксели', `${((info.width * info.height) / 1e6).toFixed(1)} Мп`] : null,
        info?.duration ? ['Длительность', fmtDuration(info.duration)] : null,
        ['Размер', fmtSize(info?.size ?? file.size)],
        ['Изменён', fmtDate(info?.mtime)],
        ['Создан', fmtDate(info?.ctime)],
    ].filter(Boolean);

    return (
        <div className="metadata-panel folder-panel">
            <div className="metadata-preview">
                <img src={file.thumbUrl} alt={file.title} />
            </div>

            <div className="metadata-content">
                <div className="fp-title" title={file.title}>{file.title}</div>
                <button className="fp-path" onClick={copyPath} title="Скопировать полный путь">
                    <i aria-hidden="true" className={`bi ${copied ? 'bi-check2' : 'bi-folder2'}`} />
                    <span>{info?.dir || file.filePath}</span>
                </button>

                <div className="fp-actions">
                    <button className="fp-action" onClick={() => fsApi.reveal(file.filePath)} title="Показать в проводнике">
                        <i aria-hidden="true" className="bi bi-folder-symlink" /><span>В проводнике</span>
                    </button>
                    <button className="fp-action" onClick={() => fsApi.open(file.filePath)} title="Открыть в приложении по умолчанию">
                        <i aria-hidden="true" className="bi bi-box-arrow-up-right" /><span>Открыть</span>
                    </button>
                    <button className="fp-action" onClick={copyPath} title="Скопировать путь">
                        <i aria-hidden="true" className={`bi ${copied ? 'bi-check2' : 'bi-clipboard'}`} /><span>Путь</span>
                    </button>
                </div>

                <div className="fp-info">
                    {rows.map(([k, v]) => (
                        <div key={k} className="fp-row"><span>{k}</span><b>{v}</b></div>
                    ))}
                    {info?.error && <div className="fp-row error">{info.error}</div>}
                </div>

                <div className="fp-import">
                    <div className="fp-import-title"><i aria-hidden="true" className="bi bi-box-arrow-in-down" /> В библиотеку</div>

                    <div className="fp-target">
                        <button className={`fp-target-btn ${picking ? 'open' : ''}`} onClick={() => setPicking(v => !v)}>
                            <i aria-hidden="true" className={`bi ${target.collectionId ? 'bi-folder' : 'bi-inbox'}`} />
                            <span>{targetName}</span>
                            <i aria-hidden="true" className="bi bi-chevron-down ms-auto" />
                        </button>
                        {picking && (
                            <div className="fp-target-drop">
                                <CollectionTreeSelect
                                    value={target.collectionId ?? null}
                                    onSelect={(id) => { setTarget(t => ({ ...t, collectionId: id })); setPicking(false); }}
                                    onClose={() => setPicking(false)}
                                />
                            </div>
                        )}
                    </div>

                    <TagEditor tags={target.tags} onChange={(tags) => setTarget(t => ({ ...t, tags }))} />

                    {state && state !== 'busy' ? (
                        <div className={`fp-result ${state.done ? 'ok' : 'warn'}`}>
                            <i aria-hidden="true" className={`bi ${state.done ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill'}`} />
                            <span>{state.message}</span>
                            {state.duplicate && (
                                <button className="btn btn-sm btn-link" onClick={() => doImport(true)}>Добавить копию</button>
                            )}
                        </div>
                    ) : (
                        <button className="fp-import-btn" disabled={state === 'busy'} onClick={() => doImport(false)}>
                            {state === 'busy'
                                ? <><i aria-hidden="true" className="bi bi-arrow-repeat spin me-1" /> Импорт…</>
                                : <><i aria-hidden="true" className="bi bi-plus-lg me-1" /> Импортировать</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FolderPanel;
