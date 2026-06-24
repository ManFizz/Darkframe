import React, {useCallback, useEffect, useMemo} from 'react';
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

const Navigation = ({ file, modalUpdater, mainArray, setDegree, panelOpen, onPanelToggle }) => {
    const { isFav, toggleFav } = useFavorites();

    const currentIndex = useMemo(() => {
        return mainArray.findIndex(f =>
            String(f.uniqueId) === String(file.uniqueId)
        );
    }, [mainArray, file]);

    const { position, total } = useMemo(() => {
        const displayable = mainArray.filter(f =>
            f.type === FILE_TYPES.IMAGE || f.type === FILE_TYPES.VIDEO
        );
        const idx = displayable.findIndex(f =>
            String(f.uniqueId) === String(file.uniqueId)
        );
        return { position: idx + 1, total: displayable.length };
    }, [mainArray, file]);

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
                    if(onPanelToggle == null) //bypass in library
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
        <div className="modal-nav-container">
            <div className="modal-nav-row">
                <i
                    className="bi bi-arrow-left-square btn-cancel"
                    onClick={() => modalUpdater(null)}
                />
                {!onPanelToggle && ( //bypass in library
                    <i
                        className={`bi ${isFav(file.thumbUrl) ? "bi-heart-fill" : "bi-heart"}`}
                        onClick={handleToggleFav}
                    />
                )}
                <i
                    className="bi bi-arrow-clockwise"
                    onClick={() => setDegree(d => (d + 90) % 360)}
                />
                {onPanelToggle && (
                    <i
                        className={`bi bi-layout-sidebar-reverse modal-nav-panel-btn ${panelOpen ? 'active' : ''}`}
                        onClick={onPanelToggle}
                        title={panelOpen ? 'Скрыть панель' : 'Показать панель'}
                    />
                )}
            </div>

            {position > 0 && total > 0 && (
                <div className="modal-nav-counter">
                    {position}/{total}{CanMoreMedia() ? '+' : ''}
                </div>
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
