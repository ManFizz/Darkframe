import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {appUrl} from '@/Infrastructure/electron';

/**
 * The preview of a model: one of its files, picked from a grid. "Automatic" goes
 * back to the best rated file (the default).
 */
const CoverPicker = ({ model, onClose }) => {
    const [files, setFiles] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        LibraryService.getModelFiles(model.id)
            .then(rows => { if (alive) setFiles(rows); })
            .catch(e => { if (alive) setError(e.message); });
        return () => { alive = false; };
    }, [model.id]);
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    const pick = async (itemId) => {
        setBusy(true);
        try {
            await LibraryService.setModelCover(model.id, itemId);
            notify({ message: itemId ? `Превью «${model.name}» изменено` : `«${model.name}»: превью выбирается автоматически`, type: 'success' });
            onClose();
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    return createPortal(
        <div className="settings-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="settings-modal cover-picker">
                <div className="settings-header">
                    <i className="bi bi-person-square me-2" />
                    <span>Превью: {model.name}</span>
                    <button className="settings-close" onClick={onClose} title="Закрыть (Esc)"><i className="bi bi-x-lg" /></button>
                </div>
                <div className="cover-picker-bar">
                    <span>Нажмите на файл, чтобы сделать его превью модели.</span>
                    <button className={`btn btn-sm ${model.customCover ? 'btn-outline-secondary' : 'btn-secondary'}`} disabled={busy || !model.customCover}
                            onClick={() => pick(null)} title="Лучший по оценке файл модели">
                        <i className="bi bi-magic me-1" />{model.customCover ? 'Автоматически' : 'Сейчас: автоматически'}
                    </button>
                </div>
                {error && <div role="alert" className="cover-picker-note err">{error}</div>}
                <div className="cover-picker-grid">
                    {!files && !error && Array.from({ length: 12 }, (_, i) => <div key={i} className="cover-picker-tile skel" />)}
                    {(files || []).map(f => {
                        const on = f.id === model.coverId;
                        return (
                            <button key={f.id} className={`cover-picker-tile ${on ? 'on' : ''}`} disabled={busy} onClick={() => pick(f.id)} title={f.title}>
                                <img src={appUrl(f.thumbPath)} alt="" loading="lazy" decoding="async" draggable={false} />
                                {/^video\//.test(f.mimeType) && <i className="bi bi-play-circle-fill cover-picker-kind" />}
                                {on && <span className="cover-picker-mark"><i className="bi bi-check-lg" /> {model.customCover ? 'превью' : 'авто'}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default CoverPicker;
