import React, {useState} from 'react';
import {mangaApi} from '@/Infrastructure/Ipc';
import {notify} from '@services/NotificationService';
import {readLibraryManga} from '@services/mangaLibrary';

const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// "Make a manga" of selected library images (in the shown order) or of files
// picked in the Folders browser (`files`).
const MakeMangaButton = ({ items, files, defaultTitle, collectionId, onDone, className = 'btn btn-sm btn-outline-secondary' }) => {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [trash, setTrash] = useState(true);
    const [busy, setBusy] = useState(false);
    const count = items ? items.length : files.length;

    const start = () => { setTitle(defaultTitle || items?.[0]?.title || ''); setOpen(true); };

    const make = async () => {
        setBusy(true);
        try {
            const item = items
                ? (await mangaApi.fromItems(items.map(i => i.id), { title: title.trim(), collectionId, trashOriginals: trash })).item
                : await mangaApi.fromFiles(files, { title: title.trim(), collectionId: collectionId ?? null });
            setOpen(false);
            notify({
                message: `Манга «${item.title}» — ${item.pageCount} стр.${items ? ' · Ctrl+Z — отменить' : ''}`,
                type: 'success',
                duration: 7000,
                action: { label: 'Читать', onClick: () => readLibraryManga(item) },
            });
            onDone?.(item);
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <span className="mk-wrap">
            <button className={className} onClick={start} title="Сделать из выбранных одну мангу (страницы — в показанном порядке)">
                <i aria-hidden="true" className="bi bi-book me-1" /> Собрать мангу
            </button>
            {open && (
                <>
                    <div className="bulk-move-backdrop" onMouseDown={() => !busy && setOpen(false)} />
                    <div className="mk-pop" onKeyDown={e => { if (e.key === 'Enter') make(); if (e.key === 'Escape') setOpen(false); }}>
                        <div className="mk-title"><i aria-hidden="true" className="bi bi-book" /> Новая манга · {count} стр.</div>
                        <input className="form-control form-control-sm" autoFocus placeholder="Название" value={title} onChange={e => setTitle(e.target.value)} />
                        {items && (
                            <label className="mk-check">
                                <input type="checkbox" checked={trash} onChange={e => setTrash(e.target.checked)} />
                                Убрать исходные картинки в корзину
                            </label>
                        )}
                        <div className="mk-actions">
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(false)} disabled={busy}>Отмена</button>
                            <button className="btn btn-sm btn-primary" onClick={make} disabled={busy}>
                                {busy ? <i aria-hidden="true" className="bi bi-arrow-repeat spin" /> : 'Собрать'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </span>
    );
};

export default MakeMangaButton;
