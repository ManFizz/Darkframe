import React, {useEffect, useState} from 'react';
import {watchFoldersApi} from '@/Infrastructure/Ipc';
import {notify} from '@services/NotificationService';
import TagEditor from '../Library/Metadata/TagEditor';
import CollectionPicker from '../Library/Collection/CollectionPicker';

const FolderCard = ({ f, onChange, onRemove }) => {
    const [confirm, setConfirm] = useState(null);   // 'import' | 'remove'
    const [busy, setBusy] = useState(false);
    const patch = (p) => onChange({ ...f, ...p });

    const importExisting = async () => {
        setConfirm(null);
        setBusy(true);
        try {
            const res = await watchFoldersApi.importExisting(f.id);
            notify({ message: res.found ? `Найдено файлов: ${res.found}, импортировано новых: ${res.imported}` : 'В папке нет подходящих файлов', type: 'success' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`wf-card ${f.enabled ? '' : 'off'}`}>
            <div className="wf-head">
                <div className="form-check form-switch ar-switch" title={f.enabled ? 'Остановить' : 'Следить'}>
                    <input className="form-check-input" type="checkbox" checked={f.enabled} onChange={() => patch({ enabled: !f.enabled })} />
                </div>
                <i aria-hidden="true" className="bi bi-folder2-open wf-icon" />
                <div className="wf-path" title={f.path}><bdi>{f.path}</bdi></div>
                <span className={`wf-state ${f.error ? 'err' : f.watching ? 'on' : ''}`}>
                    {f.error ? <><i aria-hidden="true" className="bi bi-exclamation-triangle" /> {f.error}</>
                        : f.watching ? <><span className="wf-dot" /> слежу{f.imported ? ` · +${f.imported}` : ''}</>
                        : 'выключено'}
                </span>
            </div>

            <div className="wf-grid">
                <div className="ar-action">
                    <span className="ar-label"><i aria-hidden="true" className="bi bi-folder" /> Коллекция</span>
                    <CollectionPicker currentCollectionId={f.collectionId} onChange={collectionId => patch({ collectionId })} />
                </div>
                <div className="ar-action">
                    <span className="ar-label"><i aria-hidden="true" className="bi bi-tags" /> Теги для новых файлов</span>
                    <TagEditor tags={f.tags} onChange={tags => patch({ tags })} />
                </div>
            </div>

            <div className="wf-foot">
                <label className="ar-check">
                    <input type="checkbox" checked={f.recursive} onChange={e => patch({ recursive: e.target.checked })} /> включая подпапки
                </label>
                <span className="wf-spacer" />
                {confirm ? (
                    <span className="ar-confirm">
                        {confirm === 'import' ? 'Импортировать всё, что уже лежит в папке?' : 'Перестать следить за папкой? Файлы останутся.'}
                        <button className="btn btn-sm btn-primary" onClick={() => (confirm === 'import' ? importExisting() : onRemove(f.id))}>Да</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setConfirm(null)}>Нет</button>
                    </span>
                ) : (
                    <>
                        <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => setConfirm('import')}
                                title="Скопировать в библиотеку файлы, которые были в папке до того, как её добавили">
                            {busy ? <><i aria-hidden="true" className="bi bi-arrow-repeat spin" /> Импорт…</> : <><i aria-hidden="true" className="bi bi-box-arrow-in-down" /> Импортировать существующие</>}
                        </button>
                        <button className="ar-icon danger" onClick={() => setConfirm('remove')} title="Перестать следить"><i aria-hidden="true" className="bi bi-trash3" /></button>
                    </>
                )}
            </div>
        </div>
    );
};

// Folders whose new files are copied into the library automatically.
const WatchFoldersTool = () => {
    const [folders, setFolders] = useState(null);

    const reload = () => watchFoldersApi.list().then(setFolders);
    useEffect(() => {
        reload();
        return watchFoldersApi.onChanged(() => reload());
    }, []);

    const add = async () => {
        const dir = await watchFoldersApi.pickDir();
        if (!dir) return;
        try { setFolders(await watchFoldersApi.save({ path: dir })); }
        catch (e) { notify({ message: String(e.message).split(': ').pop(), type: 'warning' }); }
    };
    const change = async (f) => {
        setFolders(list => list.map(x => (x.id === f.id ? f : x)));
        setFolders(await watchFoldersApi.save(f));
    };
    const remove = async (id) => setFolders(await watchFoldersApi.remove(id));

    return (
        <div className="settings-body cp-manage wf-tool">
            <div className="cp-manage-head">
                <div>
                    <h3>Отслеживаемые папки</h3>
                    <p className="cp-manage-desc">
                        Новые картинки и видео из этих папок сами копируются в библиотеку (оригиналы остаются на месте).
                        Недокачанные файлы пропускаются, то, что пришло пока приложение было закрыто, подхватится при запуске.
                    </p>
                </div>
                <button className="btn btn-sm btn-primary text-nowrap" onClick={add}><i aria-hidden="true" className="bi bi-plus-lg me-1" />Добавить папку</button>
            </div>

            {folders && !folders.length && (
                <div className="cp-empty"><i aria-hidden="true" className="bi bi-folder-check fs-3" /><span>Например, «Загрузки» — всё скачанное сразу окажется в библиотеке.</span></div>
            )}

            <div className="ar-list">
                {folders?.map(f => <FolderCard key={f.id} f={f} onChange={change} onRemove={remove} />)}
            </div>

            {folders?.length > 0 && (
                <p className="cp-manage-desc mt-2">Правила импорта (вкладка рядом) тоже срабатывают на эти файлы.</p>
            )}
        </div>
    );
};

export default WatchFoldersTool;
