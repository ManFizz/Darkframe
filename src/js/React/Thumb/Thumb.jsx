import React, {useCallback} from "react";
import Image from "./Image";
import Video from "./Video";
import {getCurrentSource} from "@controllers/AppInitializerController";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import {useFavorites} from "@hooks/useFavorites";
import Collection from "./Collection";

const Thumb = (({ file, isModal, modalUpdater, isSelected, onOpen, onToggleSelect, selectionActive, inLibrary, blockedTag }) => {
    const handleClick = useCallback((e) => {
        if (file.type === FILE_TYPES.IMAGE ||
            file.type === FILE_TYPES.VIDEO ||
            file.type === FILE_TYPES.COLLECTION) {
            modalUpdater(file, e);
        }
    }, [file, modalUpdater]);

    const { isFav, isPending, toggleFav } = useFavorites();

    const handleLikeClick = (event) => {
        event.stopPropagation();
        toggleFav(file);
    };

    const handleOpenClick = (event) => {
        event.stopPropagation();
        onOpen?.(file);
    };

    const handleCheckClick = (event) => {
        event.stopPropagation();   // don't also trigger the body-click select
        onToggleSelect?.(file, event);
    };

    const handleContextMenu = (event) => {
        event.preventDefault();
        if (file.type !== FILE_TYPES.IMAGE && file.type !== FILE_TYPES.VIDEO) return;
        if (onOpen) onOpen(file);
        else modalUpdater(file, event);
    };

    const renderContent = () => {
        switch (file.type) {
            case FILE_TYPES.IMAGE: return <Image file={file} />;
            case FILE_TYPES.VIDEO: return <Video file={file} />;
            case FILE_TYPES.LIBRARY: return <Collection file={file} />;
            default: return null;
        }
    };

    const hasOverlay = file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO;
    const isRemovedInFavs = !isFav(file) && getCurrentSource() === SOURCE_TYPES.FAVORITE;

    // Favouriting only makes sense from external modules; inside the library the
    // rating handles it (the library grid is the one that passes `onOpen`). We
    // still show the heart on already-favourited items in the standalone Favorites
    // view so they can be un-favourited there.
    const showHeart = hasOverlay && !onOpen && (file.remoteType !== SOURCE_TYPES.LIBRARY || isFav(file));

    const selectable = hasOverlay && !!onToggleSelect;

    return (
        <div
            className={`card thumb bg-dark ${isModal ? 'modal-active' : ''} ${isRemovedInFavs ? 'opacity-50' : ''} ${isSelected ? 'thumb-selected' : ''} ${selectionActive ? 'selection-active' : ''} ${blockedTag ? 'thumb-blocked' : ''}`}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
        >
            {selectable && (
                <button
                    type="button"
                    className={`thumb-check ${isSelected ? 'checked' : ''}`}
                    title="Выделить (Shift — диапазон)"
                    onClick={handleCheckClick}
                >
                    <i className={`bi ${isSelected ? 'bi-check-square-fill' : 'bi-square'}`} />
                </button>
            )}
            {hasOverlay && (
                <div className="overlay">
                    {onOpen && !isModal && (
                        <i
                            className="bi bi-arrows-fullscreen overlay-open"
                            title="Открыть"
                            onClick={handleOpenClick}
                        />
                    )}
                    {showHeart && (
                        isPending(file)
                            ? <i className="bi bi-arrow-repeat spin" title="Добавление…" />
                            : <i
                                className={`bi ${isFav(file) ? 'bi-ban' : 'bi-heart-fill'}`}
                                onClick={handleLikeClick}
                            />
                    )}
                </div>
            )}
            {file.score != null && hasOverlay && (
                <span className="thumb-score" title="Score"><i className="bi bi-star-fill" /> {file.score}</span>
            )}
            {inLibrary && (
                <span className="thumb-inlib" title="Уже в библиотеке"><i className="bi bi-bookmark-check-fill" /></span>
            )}
            {blockedTag && (
                <span className="thumb-blocked-tag" title="Скрыт чёрным списком"><i className="bi bi-eye-slash" /> {blockedTag}</span>
            )}
            {renderContent()}
        </div>
    );

});

export default Thumb;
