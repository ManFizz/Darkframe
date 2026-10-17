import React, {useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import LibraryView from '../Library/LibraryView';

const ModelsView = () => {
    const [models, setModels] = useState([]);
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');
    const load = () => LibraryService.getModels().then(setModels).catch(() => setModels([]));
    useEffect(() => { load(); window.addEventListener('df:libraryReload', load); return () => window.removeEventListener('df:libraryReload', load); }, []);
    if (selected) return <div className="models-detail"><button className="btn btn-sm btn-outline-secondary m-2" onClick={() => setSelected(null)}><i className="bi bi-arrow-left me-1" />Все модели</button><LibraryView model={selected} /></div>;
    const q = search.trim().toLowerCase();
    const shown = models.filter(m => !q || m.name.includes(q));
    return <main className="models-view">
        <div className="models-header"><h2><i className="bi bi-people me-2" />Модели</h2><input className="form-control" placeholder="Поиск модели…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="models-grid">{shown.map(model => <button className="model-card" key={model.id} onClick={() => setSelected(model)}>
            {model.thumbUrl ? <img src={model.thumbUrl} alt="" /> : <div className="model-placeholder"><i className="bi bi-person" /></div>}
            <strong>{model.name}</strong><small>{model.count} файлов</small>
        </button>)}</div>
        {!shown.length && <div className="tm-empty">Моделей пока нет. Назначьте тегу тип «Модель» в управлении тегами.</div>}
    </main>;
};
export default ModelsView;
