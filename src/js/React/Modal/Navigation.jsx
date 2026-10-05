import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {CanMoreMedia, LoadMoreMedia} from "@modules/r34/R34Controller";
import {FILE_TYPES} from "@/Constants";
import {useFavorites} from "@hooks/useFavorites";

const DIRECTION = {
    LEFT: -1,
    RIGHT: 1,
};

const isCanDisplayedByIdx = (mainArray, nextIdx) => {
    if (!mainArray || nextIdx < 0 || nextIdx >= mainArray.length)
        return false;

    const item = mainArray[nextIdx];
    return item.type === FILE_TYPES.VIDEO || item.type === FILE_TYPES.IMAGE;
};

// hidden — visually hidden (slideshow running) but still mounted, so Escape / arrows work
const Navigation = ({ uiTheme = 'dark', file, modalUpdater, mainArray, setDegree, panelOpen, onPanelToggle, stripOpen = false, onStripToggle = null, onEdit, onApplyLast, onDuplicate, onSlideshow, showFav, hidden = false }) => {
    const { isFav, isPending, toggleFav } = useFavorites();
    const [editingCounter, setEditingCounter] = useState(false);
    const [counterInput, setCounterInput] = useState('');

    const currentIndex = useMemo(() => {
        return mainArray.findIndex(f =>
            String(f.uniqueId) === String(file.uniqueId)
        );
    }, [mainArray, file]);

    const { displayable, position, total } = useMemo(() => {
        const displayable = mainArray.filter(f =>
            f.type === FILE_TYPES.IMAGE || f.type === FILE_TYPES.VIDEO
        );
        const idx = displayable.findIndex(f =>
            String(f.uniqueId) === String(file.uniqueId)
        );
        return { displayable, position: idx + 1, total: displayable.length };
    }, [mainArray, file]);

    // Jump to a 1-based position among the displayable items.
    const jumpTo = useCallback((n) => {
        if (!displayable.length) return;
        const target = displayable[Math.max(0, Math.min(n - 1, displayable.length - 1))];
        if (target) modalUpdater(target);
    }, [displayable, modalUpdater]);

    const commitCounter = useCallback(() => {
        const n = parseInt(counterInput, 10);
        setEditingCounter(false);
        if (!isNaN(n)) jumpTo(n);
    }, [counterInput, jumpTo]);

    // Close the input if we navigate away by other means.
    useEffect(() => { setEditingCounter(false); }, [file?.uniqueId]);

    const openShift = useCallback((direction) => {
        const nextIdx = currentIndex + direction;

        if (nextIdx < 0) return;

        if (nextIdx >= mainArray.length && CanMoreMedia()) {
            LoadMoreMedia();
            return;
        }

        if (isCanDisplayedByIdx(mainArray, nextIdx)) {
            modalUpdater(mainArray[nextIdx]);
        }
    }, [currentIndex, mainArray, modalUpdater]);

    const handleToggleFav = useCallback(() => {
        toggleFav(file);
    }, [file]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey) return;
            if (document.querySelector('.img-editor')) return;   // editor owns the keyboard

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    openShift(DIRECTION.LEFT);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    openShift(DIRECTION.RIGHT);
                    break;
                case 'Enter':
                    if (showFav) // favourites only exist outside the library
                        handleToggleFav();
                    break;
                case 'Escape':
                    modalUpdater(null);
                    break;
            }
        };

        const handleMouse = (e) => {
            if (e.buttons & 8) openShift(DIRECTION.LEFT);
            if (e.buttons & 16) openShift(DIRECTION.RIGHT);
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleMouse);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleMouse);
        };
    }, [openShift, modalUpdater]);

    const canGoLeft  = isCanDisplayedByIdx(mainArray, currentIndex - 1);
    const canGoRight = isCanDisplayedByIdx(mainArray, currentIndex + 1);

    return (
        <div className={`modal-nav-container ${hidden ? 'nav-hidden' : ''}`}>
            <div className="modal-nav-row" data-bs-theme={uiTheme}>
                <i
                    className="bi bi-arrow-left-square btn-cancel"
                    title="Закрыть"
                    onClick={() => modalUpdater(null)}
                />
                {showFav && (
                    isPending(file)
                        ? <i className="bi bi-arrow-repeat spin" title="Добавление…" />
                        : <i
                            className={`bi ${isFav(file) ? "bi-heart-fill" : "bi-heart"}`}
                            title={isFav(file) ? "Убрать из избранного" : "В избранное"}
                            onClick={handleToggleFav}
                        />
                )}
                <i
                    className="bi bi-arrow-clockwise"
                    title="Повернуть на 90°"
                    onClick={() => setDegree(d => (d + 90) % 360)}
                />
                {onEdit && (
                    <i
                        className="bi bi-crop"
                        title="Редактировать (поворот / обрезка)"
                        onClick={onEdit}
                    />
                )}
                {onApplyLast && (
                    <i
                        className="bi bi-magic"
                        title="Применить последнюю правку (поворот / обрезку)"
                        onClick={onApplyLast}
                    />
                )}
                {onDuplicate && (
                    <i
                        className="bi bi-copy"
                        title="Дублировать (полная копия)"
                        onClick={onDuplicate}
                    />
                )}
                {onSlideshow && (
                    <i
                        className="bi bi-play-btn"
                        title="Слайдшоу (S)"
                        onClick={onSlideshow}
                    />
                )}
                {onStripToggle && (
                    <i
                        className={`bi bi-film modal-nav-panel-btn ${stripOpen ? 'active' : ''}`}
                        onClick={onStripToggle}
                        title={stripOpen ? 'Спрятать ленту миниатюр (T)' : 'Показать ленту миниатюр (T)'}
                    />
                )}
                {onPanelToggle && (
                    <i
                        className={`bi bi-layout-sidebar-reverse modal-nav-panel-btn ${panelOpen ? 'active' : ''}`}
                        onClick={onPanelToggle}
                        title={panelOpen ? 'Скрыть панель' : 'Показать панель'}
                    />
                )}
            </div>

            {position > 0 && total > 0 && (
                editingCounter ? (
                    <div className="modal-nav-counter editing">
                        <input
                            className="modal-nav-counter-input"
                            type="number"
                            min={1}
                            max={total}
                            autoFocus
                            value={counterInput}
                            onChange={e => setCounterInput(e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => {
                                e.stopPropagation();   // don't let modal arrows/Enter/Escape react
                                if (e.key === 'Enter') commitCounter();
                                if (e.key === 'Escape') setEditingCounter(false);
                            }}
                            onBlur={() => setEditingCounter(false)}
                        />
                        <span className="modal-nav-counter-total">/ {total}{CanMoreMedia() ? '+' : ''}</span>
                    </div>
                ) : (
                    <div
                        className="modal-nav-counter clickable"
                        title="Кликните, чтобы перейти к номеру"
                        onClick={() => { setCounterInput(String(position)); setEditingCounter(true); }}
                    >
                        {position}/{total}{CanMoreMedia() ? '+' : ''}
                    </div>
                )
            )}

            {canGoLeft && (
                <i
                    className="bi bi-chevron-compact-left arrow arrow-left"
                    onClick={() => openShift(DIRECTION.LEFT)}
                />
            )}
            {(canGoRight || CanMoreMedia()) && (
                <i
                    className="bi bi-chevron-compact-right arrow arrow-right"
                    onClick={() => openShift(DIRECTION.RIGHT)}
                />
            )}
        </div>
    );
};

export default Navigation;
