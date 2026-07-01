import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Navigation from "./Navigation";
import Tags from "./Tags";
import Video from "./Video";
import MetadataPanel from "../Library/Metadata/MetadataPanel";
import Settings from "../../../../data/settings";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import {useFavorites} from "@hooks/useFavorites";
import {cachedMediaUrl} from "@/Infrastructure/MediaCache";

const DELETE_DELAY = 1500;

const Modal = ({ fileId, mainArray, modalUpdater, displayFiles, onUpdated }) => {
    const [isLong, setIsLong]             = useState(false);
    const [degree, setDegree]             = useState(0);
    const [panelOpen, setPanelOpen]       = useState(true);
    const [deleteCountdown, setDeleteCountdown] = useState(false);
    const deleteTimerRef = useRef(null);
    const modalRef       = useRef(null);
    const preloadRef     = useRef(new Map());
    const { isFav }      = useFavorites();

    const file = useMemo(() =>
        mainArray.find(f => f.uniqueId === fileId) || null,
    [fileId, mainArray]);

    const isLibrary  = file?.remoteType === SOURCE_TYPES.LIBRARY;
    const showPanel  = isLibrary && panelOpen && onUpdated;

    // Переход к соседнему файлу (используется при удалении и смене коллекции)
    const navigateToNext = useCallback(() => {
        const currentIndex = mainArray.findIndex(f => f.uniqueId === fileId);
        const next = mainArray[currentIndex + 1] || mainArray[currentIndex - 1];

        if (next && (next.type === FILE_TYPES.IMAGE || next.type === FILE_TYPES.VIDEO)) {
            modalUpdater(next);
        } else {
            modalUpdater(null);
        }
    }, [fileId, mainArray, modalUpdater]);

    // Переход к соседнему файлу и удаление текущего
    const handleDelete = useCallback(() => {
        if (!file || !onUpdated) return;
        navigateToNext();
        onUpdated('delete', file.id);
    }, [file, navigateToNext, onUpdated]);

    // Отмена countdown при смене файла
    useEffect(() => {
        return () => {
            if (deleteTimerRef.current) {
                clearTimeout(deleteTimerRef.current);
                deleteTimerRef.current = null;
                setDeleteCountdown(false);
            }
        };
    }, [fileId]);

    // Delete-клавиша с задержкой (capture — раньше Navigation's Escape)
    useEffect(() => {
        if (!isLibrary || !onUpdated) return;

        const handleKey = (e) => {
            if (e.key === 'Delete') {
                e.stopPropagation();
                if (deleteTimerRef.current) return;

                setDeleteCountdown(true);
                deleteTimerRef.current = setTimeout(() => {
                    deleteTimerRef.current = null;
                    setDeleteCountdown(false);
                    handleDelete();
                }, DELETE_DELAY);
            }

            if (e.key === 'Escape' && deleteTimerRef.current) {
                e.stopPropagation();
                clearTimeout(deleteTimerRef.current);
                deleteTimerRef.current = null;
                setDeleteCountdown(false);
            }
        };

        document.addEventListener('keydown', handleKey, true);
        return () => document.removeEventListener('keydown', handleKey, true);
    }, [isLibrary, onUpdated, handleDelete]);

    useEffect(() => {
        if (!file) return;
        let cancelled = false;

        setIsLong(false);
        setDegree(0);

        if (modalRef.current) {
            modalRef.current.scrollTo(0, 0);
            modalRef.current.focus();
        }

        file.getSize().then(size => {
            if (cancelled) return;
            if (size && size.height >= 1200 && size.height / size.width > 2.25) {
                setIsLong(true);
            }
        });

        return () => { cancelled = true; };
    }, [file?.uniqueId]);

    useEffect(() => {
        if (!file) return;

        const index = mainArray.findIndex(f => f.uniqueId === file.uniqueId);
        if (index === -1) return;

        const WINDOW = 3;
        const wanted = new Set();
        for (let d = -WINDOW; d <= WINDOW; d++) {
            const neighbor = mainArray[index + d];
            if (neighbor?.type === FILE_TYPES.IMAGE) {
                wanted.add(cachedMediaUrl(neighbor.getUrl()));
            }
        }

        const cache = preloadRef.current;
        wanted.forEach(url => {
            if (cache.has(url)) return;
            const img = new window.Image();
            img.decoding = 'async';
            img.src = url;
            img.decode?.().catch(() => {});
            cache.set(url, img);
        });

        for (const url of [...cache.keys()]) {
            if (!wanted.has(url)) cache.delete(url);
        }
    }, [file, mainArray]);

    const handlePanelUpdated = useCallback((idOrAction, data) => {
        if (idOrAction === 'delete') {
            handleDelete();
            return;
        }

        if (file && data && 'collectionId' in data && data.collectionId !== file.collectionId) {
            navigateToNext();
        }

        onUpdated?.(idOrAction, data);
    }, [handleDelete, navigateToNext, onUpdated, file]);

    if (!file) return null;

    const mediaContent = file.type === FILE_TYPES.IMAGE ? (
        <img
            alt={file.title}
            src={cachedMediaUrl(file.getUrl())}
            style={{ transform: `rotate(${degree}deg)` }}
        />
    ) : (
        <Video file={file} />
    );

    return (
        <>
            <dialog
                className={`modal-view ${isFav(file) ? "favorite" : ""} ${showPanel ? 'with-panel' : ''} ${Settings.LongView && isLong ? "long" : ""}`}
                open
                ref={modalRef}
                tabIndex="-1"
                onContextMenu={(e) => {
                    if (e.target.closest('.modal-panel-wrapper')) return;
                    e.preventDefault();
                    modalUpdater(null);
                }}
            >
                <Navigation
                    file={file}
                    modalUpdater={modalUpdater}
                    mainArray={mainArray}
                    setDegree={setDegree}
                    displayFiles={displayFiles}
                    panelOpen={panelOpen}
                    onPanelToggle={isLibrary && onUpdated ? () => setPanelOpen(v => !v) : null}
                />

                {showPanel ? (
                    <>
                        <div className="modal-media-area">
                            <div className="modal-content-wrapper">
                                {mediaContent}
                            </div>
                        </div>
                        <div className="modal-panel-wrapper">
                            <MetadataPanel file={file} onUpdated={handlePanelUpdated} />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="modal-content-wrapper">
                            {mediaContent}
                        </div>
                        <Tags file={file} />
                    </>
                )}
            </dialog>

            {deleteCountdown && (
                <div className="modal-delete-countdown">
                    <span>Удаление файла... Esc — отмена</span>
                    <div className="modal-delete-countdown-bar" />
                </div>
            )}
        </>
    );
};

export default Modal;
