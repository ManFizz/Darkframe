import React, {useCallback, useEffect, useRef, useState} from 'react';
import {CanMoreMedia, LoadMoreMedia} from "../../Controllers/R34Controller";

const Navigation = ({ file, modalUpdater, mainArray, setDegree, currentSource, displayFiles }) => {
    const [isFav, setIsFav] = useState(file.isFav());
    const timerRef = useRef(null);

    const currentIndex = mainArray.findIndex(f =>
        String(f.uniqueId) === String(file.uniqueId)
    );

    const openShift = useCallback((direction) => {
        const nextIdx = currentIndex + direction;

        if (nextIdx >= 0 && nextIdx < mainArray.length) {
            const nextFile = mainArray[nextIdx];
            modalUpdater(nextFile);
        } else if (direction > 0 && CanMoreMedia()) {
            LoadMoreMedia();
        }
    }, [currentIndex, mainArray, modalUpdater]);

    const toggleFav = () => {
        file.ToggleFav();
        setIsFav(file.isFav());
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); openShift(-1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); openShift(1); }
            if (e.key === 'Enter') toggleFav();
            if (e.key === 'Escape') modalUpdater(null);
        };

        const handleMouse = (e) => {
            if (e.buttons & 8) openShift(-1);
            if (e.buttons & 16) openShift(1);
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleMouse);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleMouse);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [openShift, modalUpdater]);

    useEffect(() => {
        setIsFav(file.isFav());
    }, [file, displayFiles]);

    return (
        <div className="modal-nav-container">
            <i className={`bi ${isFav ? "bi-heart-fill" : "bi-heart"}`} onClick={toggleFav} />
            <i className="bi bi-arrow-clockwise" onClick={() => setDegree(d => (d + 90) % 360)} />
            <i className="bi bi-arrow-left-square btn-cancel" onClick={() => modalUpdater(null)} />
            {currentIndex > 0 && (
                <i className="bi bi-chevron-compact-left arrow arrow-left" onClick={() => openShift(-1)} />
            )}
            {(currentIndex < mainArray.length - 1 || CanMoreMedia()) && (
                <i className="bi bi-chevron-compact-right arrow arrow-right" onClick={() => openShift(1)} />
            )}
        </div>
    );
};

export default Navigation;