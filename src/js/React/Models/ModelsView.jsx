import React, {useCallback, useEffect, useMemo, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import LibraryView from '../Library/LibraryView';
import {appUrl} from '@/Infrastructure/electron';
import {setOpenModel, useOpenModel} from './modelsState';
import CoverPicker from './CoverPicker';

/**
 * "Модели": every library tag of the category "Модель" as a card (cover — the
 * best rated file with it, how many files). A card opens the library filtered by
 * that tag, with the library's own search / sort in the top bar.
 *
 * A tag becomes a model by its category: right click on a tag anywhere → «Модель»,
 * or in the tag manager. The preview can be picked from the model's files.
 */
const SORT_KEY = 'jsg_models_sort';
const files = (n) => {
    const d = n % 10, h = n % 100;
    return `${n} ${d === 1 && h !== 11 ? 'файл' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'файла' : 'файлов'}`;
};

const ModelsView = () => {
    const open = useOpenModel();
    const [models, setModels] = useState(null);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState(() => { try { return localStorage.getItem(SORT_KEY) || 'name'; } catch { return 'name'; } });
    const [error, setError] = useState('');
    const [menu, setMenu] = useState(null);   // { model, x, y }
    const [picking, setPicking] = useState(null);   // model whose preview is being chosen

    const load = useCallback(() => LibraryService.getModels()
        .then(rows => { setModels(rows); setError(''); })
        .catch(e => { setError(e.message); setModels(m => m || []); }), []);
    useEffect(() => {
        load();
        window.addEventListener('df:libraryReload', load);
        return () => window.removeEventListener('df:libraryReload', load);
    }, [load]);
    // The open model is no longer a model (category changed, tag gone): back to the list.
    useEffect(() => {
        if (open && models && !models.some(m => m.id === open.id)) setOpenModel(null);
    }, [open, models]);
    useEffect(() => { try { localStorage.setItem(SORT_KEY, sort); } catch { /* ignore */ } }, [sort]);
    useEffect(() => {
        if (!menu) return;
        const close = () => setMenu(null);
        window.addEventListener('mousedown', close);
        window.addEventListener('blur', close);
        return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close); };
    }, [menu]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (models || []).filter(m => !q || m.name.toLowerCase().includes(q)).sort((a, b) => (sort === 'count'
            ? b.count - a.count || a.name.localeCompare(b.name, 'ru', { numeric: true })
            : a.name.localeCompare(b.name, 'ru', { numeric: true })));
    }, [models, search, sort]);

    const unmodel = async (m) => {
        setMenu(null);
        try {
            await LibraryService.setTagType([m.id], null);
            notify({ message: `«${m.name}» больше не модель (тег остался)`, type: 'info' });
        } catch (e) {
            notify({ message: e.message, type: 'danger' });
        }
    };

    if (open) {
        const cur = models?.find(m => m.id === open.id) || open;
        return (
            <div className="models-detail">
                <div className="models-detail-bar">
                    <button className="ftb-btn" onClick={() => setOpenModel(null)} title="Все модели"><i className="bi bi-arrow-left" /> <span>Модели</span></button>
                    {cur.thumbUrl && <img className="models-detail-avatar" src={appUrl(cur.thumbUrl)} alt="" />}
                    <div className="models-detail-name">{cur.name}</div>
                    <span className="models-detail-count">{files(cur.count)}</span>
                    <button className="ftb-btn models-detail-cover" onClick={() => setPicking(cur)} title="Выбрать превью модели из её файлов">
                        <i className="bi bi-person-square" /> <span>Превью</span>
                    </button>
                </div>
                <div className="models-detail-lib">
                    <LibraryView key={cur.id} model={cur} />
                </div>
                {picking && <CoverPicker model={models?.find(m => m.id === picking.id) || picking} onClose={() => setPicking(null)} />}
            </div>
        );
    }

    return (
        <main className="models-view">
            <div className="models-header">
                <h2><i className="bi bi-people" /> Модели{models?.length ? <small>{models.length}</small> : null}</h2>
                <input className="form-control form-control-sm models-search" placeholder="Поиск модели…" value={search} onChange={e => setSearch(e.target.value)} />
                <div className="models-sort">
                    {[['name', 'По имени', 'bi-sort-alpha-down'], ['count', 'По числу файлов', 'bi-sort-numeric-down-alt']].map(([id, label, icon]) => (
                        <button key={id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)} title={label}><i className={`bi ${icon}`} /> <span>{label}</span></button>
                    ))}
                </div>
            </div>
            {error && <div role="alert" className="models-empty err">{error} <button className="btn btn-sm btn-outline-secondary ms-2" onClick={load}>Повторить</button></div>}
            {!models && !error && <div className="models-grid">{Array.from({ length: 12 }, (_, i) => <div key={i} className="model-card skel"><div className="model-cover" /></div>)}</div>}
            {models && (
                <div className="models-grid">
                    {shown.map(m => (
                        <button className="model-card" key={m.id} onClick={() => setOpenModel(m)} title={m.name}
                                onContextMenu={e => { e.preventDefault(); setMenu({ model: m, x: e.clientX, y: e.clientY }); }}>
                            <div className="model-cover">
                                {m.thumbUrl ? <img src={appUrl(m.thumbUrl)} alt="" loading="lazy" decoding="async" draggable={false} /> : <i className="bi bi-person" />}
                                <span className="model-count">{m.count}</span>
                                <span className="model-cover-edit" role="button" title="Выбрать превью"
                                      onClick={e => { e.stopPropagation(); setPicking(m); }}><i className="bi bi-pencil" /></span>
                            </div>
                            <div className="model-name">{m.name}</div>
                        </button>
                    ))}
                </div>
            )}
            {models && !error && !shown.length && (
                <div className="models-empty">
                    {search.trim() ? 'Ничего не найдено' : (
                        <>
                            <i className="bi bi-people" />
                            <b>Моделей пока нет</b>
                            <span>Нажмите правой кнопкой на тег (в панели файла, в просмотре или в управлении тегами) и выберите «Модель» — здесь появится карточка со всеми её файлами.</span>
                        </>
                    )}
                </div>
            )}
            {menu && (
                <div className="tm-type-menu models-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()}>
                    <div className="tm-type-menu-head"><span className="tm-type-menu-name">{menu.model.name}</span><span className="tm-type-menu-now">{files(menu.model.count)}</span></div>
                    <button onClick={() => { setMenu(null); setOpenModel(menu.model); }}><i className="bi bi-images" /><span className="tm-type-menu-label">Открыть</span></button>
                    <button onClick={() => { setMenu(null); setPicking(menu.model); }}><i className="bi bi-person-square" /><span className="tm-type-menu-label">Выбрать превью…</span></button>
                    <button onClick={() => unmodel(menu.model)}><i className="bi bi-person-dash" /><span className="tm-type-menu-label">Убрать из моделей</span></button>
                </div>
            )}
            {picking && <CoverPicker model={models?.find(m => m.id === picking.id) || picking} onClose={() => setPicking(null)} />}
        </main>
    );
};

export default ModelsView;
