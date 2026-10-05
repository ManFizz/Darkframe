import React, {useCallback, useRef} from "react";
import Image from "./Image";
import Video from "./Video";
import {getCurrentSource} from "@controllers/AppInitializerController";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import {useFavorites} from "@hooks/useFavorites";
import Collection from "./Collection";
import {useHoverVideo} from "./useHoverVideo";

const Thumb = (({ file, isModal, modalUpdater, isSelected, onOpen, onToggleSelect, selectionActive, inLibrary, blockedTag, onDragStart }) => {
    // Touch: a long press selects (like a phone gallery); the click and the
    // context menu that follow it are swallowed.
    const press = useRef({ timer: null, fired: false, x: 0, y: 0 });
    const onTouchStart = (e) => {
        if (!onToggleSelect || e.touches.length !== 1) return;
        const t = e.touches[0];
        press.current = { fired: false, x: t.clientX, y: t.clientY, timer: setTimeout(() => {
            press.current.fired = true;
            navigator.vibrate?.(15);
            onToggleSelect(file, {});
        }, 450) };
    };
    const onTouchMove = (e) => {
        const t = e.touches[0];
        if (t && Math.hypot(t.clientX - press.current.x, t.clientY - press.current.y) > 10) clearTimeout(press.current.timer);
    };
    const onTouchEnd = () => clearTimeout(press.current.timer);

    const handleClick = useCallback((e) => {
        if (press.current.fired) { press.current.fired = false; return; }
        if (file.type === FILE_TYPES.IMAGE ||
            file.type === FILE_TYPES.VIDEO ||
            file.type === FILE_TYPES.COLLECTION) {
            modalUpdater(file, e);
        }
    }, [file, modalUpdater]);

    const { isFav, isPending, toggleFav } = useFavorites();
    // Hover preview of a video: on the whole tile — the overlay (open / heart)
    // lies on top of the picture and would swallow the hover otherwise.
    const hover = useHoverVideo(file.type === FILE_TYPES.VIDEO ? file.contentUrl : null, { startAt: file.thumbAt });

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
        if (press.current.fired || event.nativeEvent?.pointerType === 'touch') return;
        // Right click opens: the viewer, or the reader for a manga.
        if (file.type !== FILE_TYPES.IMAGE && file.type !== FILE_TYPES.VIDEO && !file.isManga) return;
        if (onOpen) onOpen(file);
        else modalUpdater(file, event);
    };

    const renderContent = () => {
        switch (file.type) {
            case FILE_TYPES.IMAGE: return <Image file={file} />;
            case FILE_TYPES.VIDEO: return <Video file={file} hoverOverlay={hover.overlay} />;
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
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            draggable={!!onDragStart && hasOverlay}
            onDragStart={onDragStart ? (e) => onDragStart(file, e) : undefined}
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
            {file.isManga && (
                <>
                    <span className="thumb-manga" title="Манга"><i className="bi bi-book" /> {file.pageCount ?? ''}</span>
                    {file.readPosition != null && file.pageCount > 0 && (
                        <div className={`thumb-readbar ${file.readFinished ? 'done' : ''}`} title={file.readFinished ? 'Прочитано' : `Прочитано до ${file.readPosition + 1}-й стр.`}>
                            <span style={{ width: `${file.readFinished ? 100 : Math.round(((file.readPosition + 1) / file.pageCount) * 100)}%` }} />
                        </div>
                    )}
                </>
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
