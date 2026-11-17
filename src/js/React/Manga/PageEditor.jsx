import React, {useCallback, useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {mangaApi} from '@/Infrastructure/Ipc';
import {isWeb} from '@/Infrastructure/electron';
import {notify} from '@services/NotificationService';
import {registerPageEditor} from '@services/mangaLibrary';

const DRAG = 'application/x-darkframe-page';
const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Pages of a library manga: select, delete (restorable), drag to reorder, set the
// cover, add pages / chapters, rename chapters.
const PageEditor = () => {
    const [item, setItem] = useState(null);
    const [book, setFullBook] = useState(null);
    // Chapters still on the site have no pages to edit.
    const setBook = useCallback((b) => setFullBook(b && { ...b, chapters: b.chapters.filter(c => !c.remote) }), []);
    const [sel, setSel] = useState(() => new Set());
    const [anchor, setAnchor] = useState(null);
    const [dropAt, setDropAt] = useState(null);     // { file, after }
    const [showRemoved, setShowRemoved] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => registerPageEditor((it) => { setItem(it); setBook(null); setSel(new Set()); }), []);
    useEffect(() => {
        if (!item) return;
        mangaApi.book(item.id).then(setBook).catch(e => notify({ message: errText(e), type: 'warning' }));
    }, [item]);

    const close = useCallback(() => { setItem(null); setBook(null); }, []);
    useEffect(() => {
        if (!item) return;
        const onKey = (e) => {
            if (e.target.closest?.('input')) return;
            if (e.key === 'Escape') { e.stopPropagation(); sel.size ? setSel(new Set()) : close(); }
            if (e.key === 'Delete' && sel.size) { e.stopPropagation(); remove(); }
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') { e.preventDefault(); e.stopPropagation(); setSel(new Set(flat.map(p => p.file))); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });

    if (!item) return null;
    const flat = book ? book.chapters.flatMap(c => c.pages) : [];

    const run = async (fn, okMsg) => {
        setBusy(true);
        try {
            const next = await fn();
            if (next) setBook(next);
            if (okMsg) notify(okMsg);
            return next;
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
            return null;
        } finally {
            setBusy(false);
        }
    };

    const click = (file, e) => {
        setSel(prev => {
            const next = new Set(e.ctrlKey || e.metaKey || e.shiftKey ? prev : []);
            if (e.shiftKey && anchor) {
                const a = flat.findIndex(p => p.file === anchor), b = flat.findIndex(p => p.file === file);
                const [lo, hi] = a < b ? [a, b] : [b, a];
                flat.slice(lo, hi + 1).forEach(p => next.add(p.file));
            } else if (next.has(file) && (e.ctrlKey || e.metaKey)) next.delete(file);
            else next.add(file);
            return next;
        });
        if (!e.shiftKey) setAnchor(file);
    };

    function remove() {
        const files = [...sel];
        const before = new Set((book.removed || []).map(r => r.stored));
        run(() => mangaApi.removePages(item.id, files)).then(next => {
            if (!next) return;
            setSel(new Set());
            const added = next.removed.filter(r => !before.has(r.stored)).map(r => r.stored);
            notify({
                message: `Удалено страниц: ${files.length}`,
                type: 'info',
                duration: 8000,
                action: { label: 'Вернуть', onClick: () => run(() => mangaApi.restorePages(item.id, added)) },
            });
        });
    }

    // Drag & drop reorder (also between chapters).
    const onDragStart = (file, e) => {
        const files = sel.has(file) ? flat.filter(p => sel.has(p.file)).map(p => p.file) : [file];
        e.dataTransfer.setData(DRAG, JSON.stringify(files));
        e.dataTransfer.effectAllowed = 'move';
    };
    const onDragOver = (file, e) => {
        if (![...e.dataTransfer.types].includes(DRAG)) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setDropAt({ file, after: e.clientX > r.left + r.width / 2 });
    };
    const onDrop = (target, e) => {
        e.preventDefault();
        const moving = JSON.parse(e.dataTransfer.getData(DRAG) || '[]');
        const at = dropAt;
        setDropAt(null);
        if (!moving.length || moving.includes(target)) return;
        const chapters = book.chapters.map(c => ({ id: c.id, files: c.pages.map(p => p.file).filter(f => !moving.includes(f)) }));
        const dest = chapters.find(c => c.files.includes(target)) || chapters.find(c => book.chapters.find(b => b.id === c.id)?.pages.some(p => p.file === target));
        if (!dest) return;
        let idx = dest.files.indexOf(target);
        if (at?.after) idx += 1;
        dest.files.splice(idx, 0, ...moving);
        run(() => mangaApi.reorder(item.id, chapters.map(c => ({ chapter: c.id, files: c.files }))));
    };

    const one = sel.size === 1 ? [...sel][0] : null;

    return createPortal(
        <div className="pe-overlay" onMouseDown={close}>
            <div className="pe" onMouseDown={e => e.stopPropagation()}>
                <div className="pe-head">
                    <i aria-hidden="true" className="bi bi-grid-3x3" />
                    <div className="pe-title">
                        <b>{item.title}</b>
                        <span>{book ? `${flat.length} стр.${book.chapters.length > 1 ? ` · ${book.chapters.length} гл.` : ''}` : '…'}</span>
                    </div>
                    {!isWeb && <>
                    <button className="btn btn-sm btn-outline-secondary" disabled={busy || !book}
                            onClick={() => run(() => mangaApi.addPagesDialog(item.id, { chapter: book.chapters[book.chapters.length - 1]?.id }))}>
                        <i aria-hidden="true" className="bi bi-plus-lg me-1" />Страницы
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" disabled={busy || !book}
                            onClick={() => run(() => mangaApi.addPagesDialog(item.id, { newChapterTitle: `Глава ${book.chapters.length + 1}` }))}>
                        <i aria-hidden="true" className="bi bi-journal-plus me-1" />Новая глава
                    </button>
                    </>}
                    <button className="pe-close" onClick={close} title="Закрыть (Esc)"><i aria-hidden="true" className="bi bi-x-lg" /></button>
                </div>

                {sel.size > 0 && (
                    <div className="pe-selbar">
                        <span>Выбрано: <b>{sel.size}</b></span>
                        {one && <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => run(() => mangaApi.setCover(item.id, one), { message: 'Обложка обновлена', type: 'success' })}>
                            <i aria-hidden="true" className="bi bi-star me-1" />Обложкой</button>}
                        <button className="btn btn-sm btn-outline-danger" disabled={busy || sel.size >= flat.length} onClick={remove}>
                            <i aria-hidden="true" className="bi bi-trash3 me-1" />Удалить
                        </button>
                        <button className="btn btn-sm btn-link" onClick={() => setSel(new Set())}>снять</button>
                        <span className="pe-hint">Del — удалить · перетаскивание — переставить · Shift/Ctrl — несколько</span>
                    </div>
                )}

                <div className="pe-body">
                    {!book ? <div className="pe-empty"><i aria-hidden="true" className="bi bi-arrow-repeat spin" /></div> : book.chapters.map((c, ci) => (
                        <section key={c.id} className="pe-chapter">
                            {(book.chapters.length > 1 || c.title) && (
                                <input className="pe-ch-title" defaultValue={c.title} placeholder={`Глава ${ci + 1}`}
                                       onBlur={e => { if (e.target.value !== c.title) run(() => mangaApi.renameChapter(item.id, c.id, e.target.value)); }}
                                       onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                            )}
                            <div className="pe-grid">
                                {c.pages.map((p) => {
                                    const n = flat.indexOf(p) + 1;
                                    return (
                                        <div key={p.file}
                                             className={`pe-page ${sel.has(p.file) ? 'sel' : ''} ${dropAt?.file === p.file ? (dropAt.after ? 'drop-after' : 'drop-before') : ''}`}
                                             draggable
                                             onDragStart={e => onDragStart(p.file, e)}
                                             onDragOver={e => onDragOver(p.file, e)}
                                             onDragLeave={() => setDropAt(d => (d?.file === p.file ? null : d))}
                                             onDrop={e => onDrop(p.file, e)}
                                             onClick={e => click(p.file, e)}
                                             title={`Страница ${n}${p.w ? ` · ${p.w}×${p.h}` : ''}`}>
                                            <img src={p.thumb} alt="" loading="lazy" draggable={false} />
                                            <span className="pe-n">{n}</span>
                                            {book.cover === p.file && <span className="pe-cover" title="Обложка"><i aria-hidden="true" className="bi bi-star-fill" /></span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}

                    {book?.removed?.length > 0 && (
                        <section className="pe-removed">
                            <button className="pe-removed-toggle" onClick={() => setShowRemoved(v => !v)}>
                                <i aria-hidden="true" className={`bi bi-chevron-${showRemoved ? 'down' : 'right'}`} /> Удалённые страницы ({book.removed.length})
                            </button>
                            {showRemoved && (
                                <>
                                    <div className="pe-removed-actions">
                                        <button className="btn btn-sm btn-outline-secondary" disabled={busy}
                                                onClick={() => run(() => mangaApi.restorePages(item.id, book.removed.map(r => r.stored)))}>
                                            <i aria-hidden="true" className="bi bi-arrow-counterclockwise me-1" />Вернуть все
                                        </button>
                                        <button className="btn btn-sm btn-outline-danger" disabled={busy}
                                                onClick={() => { if (confirm(`Удалить ${book.removed.length} стр. окончательно? Вернуть будет нельзя.`)) run(() => mangaApi.purgeRemoved(item.id)); }}>
                                            Удалить окончательно
                                        </button>
                                    </div>
                                    <div className="pe-grid">
                                        {book.removed.map(r => (
                                            <div key={r.stored} className="pe-page removed" title="Вернуть на место"
                                                 onClick={() => run(() => mangaApi.restorePages(item.id, [r.stored]))}>
                                                <img src={r.thumb} alt="" loading="lazy" draggable={false} />
                                                <span className="pe-restore"><i aria-hidden="true" className="bi bi-arrow-counterclockwise" /></span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default PageEditor;
