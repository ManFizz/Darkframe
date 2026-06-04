import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Navigation from "./Navigation";
import Tags from "./Tags";
import Video from "./Video";
import MetadataPanel from "../Library/Metadata/MetadataPanel";
import Settings from "../../../../data/settings";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import {useFavorites} from "@hooks/useFavorites";

const DELETE_DELAY = 1500;

const Modal = ({ fileId, mainArray, modalUpdater, displayFiles, onUpdated }) => {
    const [isLong, setIsLong]             = useState(false);
    const [degree, setDegree]             = useState(0);
    const [panelOpen, setPanelOpen]       = useState(true);
    const [deleteCountdown, setDeleteCountdown] = useState(false);
    const deleteTimerRef = useRef(null);
    const modalRef       = useRef(null);
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

        setIsLong(false);
        setDegree(0);

        if (modalRef.current) {
            modalRef.current.scrollTo(0, 0);
            modalRef.current.focus();
        }

        file.getSize().then(size => {
            if (size && size.height >= 1200 && size.height / size.width > 2.25) {
                setIsLong(true);
            }
        });
    }, [file?.uniqueId]);

    useEffect(() => {
        if (!file || file.type !== FILE_TYPES.IMAGE) return;

        const index = mainArray.findIndex(f => f.uniqueId === file.uniqueId);
        if (index === -1) return;

        [index - 1, index + 1].forEach(i => {
            const neighbor = mainArray[i];
            if (neighbor?.type === FILE_TYPES.IMAGE) {
                const img = new window.Image();
                img.src = neighbor.getUrl();
            }
        });
    }, [file, mainArray]);

    // Перехватываем апдейты из MetadataPanel:
    //  - 'delete' → навигируем перед удалением
    //  - смена коллекции → навигируем перед сохранением, иначе файл выпадает
    //    из текущей выборки и Modal закрывается
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
            key={fileId}
            alt={file.title}
            src={file.getUrl()}
            className={Settings.LongView && isLong ? "long" : ""}
            style={{ transform: `rotate(${degree}deg)` }}
        />
    ) : (
        <Video file={file} />
    );

    return (
        <>
            <dialog
                className={`modal-view ${isFav(file.thumbUrl) ? "favorite" : ""} ${showPanel ? 'with-panel' : ''}`}
                open
                ref={modalRef}
                tabIndex="-1"
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
