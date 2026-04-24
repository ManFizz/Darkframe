import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {CanMoreMedia, LoadMoreMedia} from "../../Controllers/R34Controller";
import {subscribeFavorites} from "../../FavController";

const DIRECTION = {
    LEFT: -1,
    RIGHT: 1,
};

const Navigation = ({ file, modalUpdater, mainArray, setDegree }) => {
    const [isFav, setIsFav] = useState(file.isFav());

    const currentIndex = useMemo(() => {
        return mainArray.findIndex(f =>
            String(f.uniqueId) === String(file.uniqueId)
        );
    }, [mainArray, file]);

    const openShift = useCallback((direction) => {
        const nextIdx = currentIndex + direction;

        if (nextIdx >= 0 && nextIdx < mainArray.length) {
            modalUpdater(mainArray[nextIdx]);
        } else if (direction > 0 && CanMoreMedia()) {
            LoadMoreMedia();
        }
    }, [currentIndex, mainArray, modalUpdater]);

    const toggleFav = useCallback(() => {
        file.ToggleFav();
    }, [file]);

    useEffect(() => {
        const unsub = subscribeFavorites(() => {
            setIsFav(file.isFav());
        });

        return unsub;
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
                    toggleFav();
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
    }, [openShift, toggleFav, modalUpdater]);

    return (
        <div className="modal-nav-container">
            <i
                className={`bi ${isFav ? "bi-heart-fill" : "bi-heart"}`}
                onClick={toggleFav}
            />
            <i
                className="bi bi-arrow-clockwise"
                onClick={() => setDegree(d => (d + 90) % 360)}
            />
            <i
                className="bi bi-arrow-left-square btn-cancel"
                onClick={() => modalUpdater(null)}
            />

            {currentIndex > 0 && (
                <i
                    className="bi bi-chevron-compact-left arrow arrow-left"
                    onClick={() => openShift(DIRECTION.LEFT)}
                />
            )}

            {(currentIndex < mainArray.length - 1 || CanMoreMedia()) && (
                <i
                    className="bi bi-chevron-compact-right arrow arrow-right"
                    onClick={() => openShift(DIRECTION.RIGHT)}
                />
            )}
        </div>
    );
};

export default Navigation;