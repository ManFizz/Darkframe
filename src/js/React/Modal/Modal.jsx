import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {confirmDeleteForever} from '@services/deleteForever';
import Navigation from "./Navigation";
import Tags from "./Tags";
import Video from "./Video";
import MetadataPanel from "../Library/Metadata/MetadataPanel";
import RemotePanel from "./RemotePanel";
import FolderPanel from "./FolderPanel";
import ImageEditor from "./ImageEditor";
import Settings from "@data/settings";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import {useFavorites} from "@hooks/useFavorites";
import {cachedMediaUrl} from "@/Infrastructure/MediaCache";
import LibraryService from "@services/LibraryService";
import {notify} from "@services/NotificationService";
import {loadEditPreset} from "@services/imageEditPreset";
import {mediaKey} from "@services/mediaKey";
import {useSlideshow} from "./useSlideshow";
import SlideshowHud from "./SlideshowHud";
import Filmstrip from "./Filmstrip";
import AnimatedImage, {isMaybeAnimated} from "./AnimatedImage";
import {useViewPref} from "@services/viewPrefs";
import {exitViewerFullscreen} from "./fullscreen";
import {useResolvedTheme} from "@services/theme";
import {matches} from '@services/keymap';
import {readLibraryManga} from '@services/mangaLibrary';
import {isMobileView, swipeHandlers} from '@services/mobile';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

// autoSlideshow — start the slideshow as soon as the viewer opens (a "play" button
// outside the viewer: selection / whole collection).
const Modal = ({ fileId, mainArray, modalUpdater, displayFiles, onUpdated, autoSlideshow = false }) => {
    const [isLong, setIsLong]             = useState(false);
    const [degree, setDegree]             = useState(0);
    // Phone: the picture gets the whole screen; the info panel opens on request.
    const [panelOpen, setPanelOpen]       = useState(() => !isMobileView());
    const [editing, setEditing]           = useState(false);
    const [zoom, setZoom]                 = useState(1);
    const [pan, setPan]                   = useState({ x: 0, y: 0 });
    const modalRef       = useRef(null);
    const contentRef     = useRef(null);
    const panDrag        = useRef(null);
    const preloadRef     = useRef(new Map());
    const { isFav }      = useFavorites();

    const file = useMemo(() =>
        mainArray.find(f => f.uniqueId === fileId) || null,
    [fileId, mainArray]);

    const ss = useSlideshow({ file, mainArray, modalUpdater });
    // The media stage stays dark; the side panel and the toolbar follow the app theme.
    const uiTheme = useResolvedTheme();

    // Fullscreen belongs to the viewer: closing it drops back to the window.
    const isOpen = !!file;
    useEffect(() => { if (!isOpen) exitViewerFullscreen(); }, [isOpen]);
    useEffect(() => exitViewerFullscreen, []);

    const isLibrary   = file?.remoteType === SOURCE_TYPES.LIBRARY;
    const hasMetaPanel = isLibrary && !!onUpdated;               // editable library metadata
    const hasFolderPanel = file?.remoteType === SOURCE_TYPES.FOLDER && !!file?.filePath;   // file on disk
    const hasRemotePanel = !isLibrary && !hasFolderPanel && !!file?.tags?.length;   // read-only booru tag panel
    const hasSidePanel = hasMetaPanel || hasRemotePanel || hasFolderPanel;
    // The side panel steps aside for the whole slideshow (no layout jumps on pause).
    const showPanel   = panelOpen && hasSidePanel && !ss.active;
    // Thumbnail strip along the bottom (setting + T to toggle).
    const [stripPref, setStripPref] = useViewPref('filmstrip');
    const showStrip = stripPref && !ss.active && !editing;

    useEffect(() => {
        if (!file) return;
        const onKey = (e) => {
            if (!matches(e, 'viewer.filmstrip')) return;
            const el = document.activeElement;
            if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
            if (document.querySelector('.img-editor')) return;
            e.preventDefault();
            setStripPref(!stripPref);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [file, stripPref, setStripPref]);

    const autoStarted = useRef(null);
    useEffect(() => {
        if (!file) { autoStarted.current = null; return; }
        if (autoSlideshow && !ss.active && autoStarted.current !== autoSlideshow) {
            autoStarted.current = autoSlideshow;
            ss.start();
        }
    }, [file, autoSlideshow, ss]);

    // S starts the slideshow / toggles pause. While it runs, any other key, a click
    // on the media or the wheel pauses it (arrows still navigate).
    useEffect(() => {
        if (!file) return;
        const typing = () => {
            const el = document.activeElement;
            return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
        };
        const onKey = (e) => {
            if (typing() || document.querySelector('.img-editor')) return;
            if (matches(e, 'viewer.slideshow')) {
                e.preventDefault();
                ss.active ? ss.togglePause() : ss.start();
                return;
            }
            if (ss.active && !ss.paused && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) ss.pause();
        };
        const onWheel = () => { if (ss.active && !ss.paused) ss.pause(); };
        document.addEventListener('keydown', onKey);
        document.addEventListener('wheel', onWheel, { passive: true });
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('wheel', onWheel);
        };
    }, [file, ss]);

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
    // `forever`: Shift + Delete — past the trash (already confirmed by the caller).
    const handleDelete = useCallback((forever = false) => {
        if (!file || !onUpdated) return;
        navigateToNext();
        onUpdated(forever ? 'deleteForever' : 'delete', file.id);
    }, [file, navigateToNext, onUpdated]);

    // Delete key removes immediately — the trash + Undo toast make the old countdown
    // pointless. (capture phase so it runs before Navigation's key handling)
    useEffect(() => {
        if (!isLibrary || !onUpdated) return;

        const handleKey = (e) => {
            if (document.querySelector('.img-editor')) return;   // don't delete while editing
            if (e.key === 'Delete') {
                e.stopPropagation();
                if (e.shiftKey && !file?.deletedAt) {
                    if (confirmDeleteForever(1, file?.title)) handleDelete(true);
                } else handleDelete();
            }
        };

        document.addEventListener('keydown', handleKey, true);
        return () => document.removeEventListener('keydown', handleKey, true);
    }, [isLibrary, onUpdated, handleDelete]);

    // Number keys rate a library item: 1–9 set the rating, 0 sets 10, and pressing
    // the current rating again clears it. Works for both images and videos — the
    // video player no longer steals digits for percentage seeking.
    useEffect(() => {
        if (!hasMetaPanel || !file ||
            (file.type !== FILE_TYPES.IMAGE && file.type !== FILE_TYPES.VIDEO)) return;

        const onKey = (e) => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
            if (!/^(Digit|Numpad)[0-9]$/.test(e.code)) return;   // top-row and numpad
            const el = document.activeElement;
            if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
            if (document.querySelector('.img-editor')) return;   // editor owns the keyboard

            e.preventDefault();
            const digit  = Number(e.code.slice(-1));
            const rating = digit === 0 ? 10 : digit;
            const next   = (file.rating || 0) === rating ? 0 : rating;   // same value toggles off

            LibraryService.updateItem(file.id, { rating: next })
                .then(() => onUpdated?.(file.id, { rating: next }))
                .catch(err => notify({ message: `Не удалось: ${err.message}`, type: 'danger' }));
            notify({
                message: next ? `Рейтинг: ${next}/10` : 'Рейтинг снят',
                type: 'success',
                duration: 1200,
            });
        };

        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [hasMetaPanel, file, onUpdated]);

    useEffect(() => {
        if (!file) return;
        let cancelled = false;

        setIsLong(false);
        setDegree(0);
        setEditing(false);
        setZoom(1);
        setPan({ x: 0, y: 0 });

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

    // Record a view once the item has actually been looked at for a moment — a short
    // dwell keeps arrow-key fly-throughs out of the history. Dedup + per-section
    // storage happens server-side; the key is stable per source (lib id / media URL).
    useEffect(() => {
        if (!file || (file.type !== FILE_TYPES.IMAGE && file.type !== FILE_TYPES.VIDEO)) return;
        const mk = mediaKey(file);
        if (!mk) return;

        const timer = setTimeout(() => {
            LibraryService.recordView({
                ...mk,
                data: {
                    id: file.id, title: file.title, remoteId: file.remoteId,
                    width: file.width, height: file.height,
                    previewUrl: file.previewUrl, thumbUrl: file.thumbUrl, contentUrl: file.contentUrl,
                    sourceUrl: file.sourceUrl, tags: file.tags, type: file.type,
                    remoteType: file.remoteType, localUrl: file.localUrl, mimeType: file.mimeType,
                    rating: file.rating, time: file.time, size: file.size,
                    filePath: file.filePath, score: file.score,
                },
            }).catch(() => {});
        }, 900);

        return () => clearTimeout(timer);
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

    // One-click re-apply of the last edit (rotate/crop) to this image.
    const handleApplyLast = useCallback(async () => {
        const preset = loadEditPreset();
        if (!preset || !file) return;
        try {
            await LibraryService.editImage(file.id, preset);
            notify({ message: 'Правка применена', type: 'success' });
            onUpdated?.('refresh');
        } catch (e) {
            notify({ message: `Не удалось применить: ${e.message}`, type: 'danger' });
        }
    }, [file, onUpdated]);

    // Full copy of the current item (files + metadata + tags), so one can be cropped
    // independently. Reloads the list so the new copy shows up (right after the source).
    const handleDuplicate = useCallback(async () => {
        if (!file || !onUpdated) return;
        try {
            await LibraryService.duplicateItem(file.id);
            notify({ message: 'Дубликат создан', type: 'success' });
            onUpdated('refresh');
        } catch (e) {
            notify({ message: `Не удалось дублировать: ${e.message}`, type: 'danger' });
        }
    }, [file, onUpdated]);

    const handlePanelUpdated = useCallback((idOrAction, data) => {
        if (idOrAction === 'delete' || idOrAction === 'deleteForever') {
            handleDelete(idOrAction === 'deleteForever');
            return;
        }

        if (file && data && 'collectionId' in data && data.collectionId !== file.collectionId) {
            navigateToNext();
        }

        onUpdated?.(idOrAction, data);
    }, [handleDelete, navigateToNext, onUpdated, file]);

    const canZoom = file?.type === FILE_TYPES.IMAGE && !(Settings.LongView && isLong);

    const onWheel = useCallback((e) => {
        if (!canZoom || !contentRef.current) return;
        e.preventDefault();
        const rect = contentRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        const z2 = clamp(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 1, 12);
        if (z2 === zoom) return;
        if (z2 === 1) { setZoom(1); setPan({ x: 0, y: 0 }); return; }
        setPan(p => ({ x: mx - (mx - p.x) * (z2 / zoom), y: my - (my - p.y) * (z2 / zoom) }));
        setZoom(z2);
    }, [canZoom, zoom]);

    // Non-passive so preventDefault stops the modal from scrolling.
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [onWheel]);

    const onPanMove = useCallback((e) => {
        const d = panDrag.current;
        if (d) setPan({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) });
    }, []);
    const onPanUp = useCallback(() => {
        panDrag.current = null;
        window.removeEventListener('pointermove', onPanMove);
        window.removeEventListener('pointerup', onPanUp);
    }, [onPanMove]);
    const onMediaPointerDown = useCallback((e) => {
        if (ss.active && !ss.paused) ss.pause();   // touching the media pauses the show
        if (zoom <= 1 || e.button !== 0) return;
        e.preventDefault();   // stop the browser's native image-drag / text selection
        panDrag.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
        window.addEventListener('pointermove', onPanMove);
        window.addEventListener('pointerup', onPanUp);
    }, [zoom, pan, onPanMove, onPanUp, ss]);

    useEffect(() => () => {
        window.removeEventListener('pointermove', onPanMove);
        window.removeEventListener('pointerup', onPanUp);
    }, [onPanMove, onPanUp]);

    if (!file) return null;

    const imageStyle = {
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${degree}deg)`,
        cursor: zoom > 1 ? 'grab' : 'default',
    };
    const imageSrc = cachedMediaUrl(file.getUrl());
    const mediaContent = file.isManga ? (
        <div className="manga-cover-view">
            <img src={imageSrc} alt={file.title} draggable={false} />
            <button className="manga-cover-read" onClick={(e) => { e.stopPropagation(); readLibraryManga(file); }}>
                <i className="bi bi-book-half" /> Читать · {file.pageCount} стр.
            </button>
        </div>
    ) : file.type === FILE_TYPES.IMAGE ? (
        isMaybeAnimated(file, file.getUrl())
            // GIF / WebP: turns into a player (pause, frames, speed) when animated.
            ? <AnimatedImage key={file.uniqueId} file={file} src={imageSrc} alt={file.title} style={imageStyle} />
            : <img
                // Re-mounted per file during a slideshow so each slide fades in.
                key={ss.active ? file.uniqueId : 'img'}
                className={ss.active ? 'ss-slide' : undefined}
                alt={file.title}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                style={imageStyle}
                src={imageSrc}
            />
    ) : (
        <Video
            file={file}
            mainArray={mainArray}
            modalUpdater={modalUpdater}
            canEdit={hasMetaPanel}
            onEdited={() => onUpdated?.('refresh')}
            slideshow={ss.active}
            onSlideEnd={ss.onVideoEnded}
        />
    );

    return (
        <>
            {/* The media viewer stays dark in the light theme too (data-bs-theme island). */}
            <dialog
                className={`modal-view ${isFav(file) ? "favorite" : ""} ${showPanel ? 'with-panel' : ''} ${showStrip ? 'with-strip' : ''} ${Settings.LongView && isLong ? "long" : ""}`}
                data-bs-theme="dark"
                open
                ref={modalRef}
                tabIndex="-1"
                onContextMenu={(e) => {
                    if (e.target.closest('.modal-panel-wrapper')) return;
                    e.preventDefault();
                    modalUpdater(null);
                }}
            >
                {!editing && (
                    <Navigation
                        uiTheme={uiTheme}
                        file={file}
                        modalUpdater={modalUpdater}
                        mainArray={mainArray}
                        setDegree={setDegree}
                        displayFiles={displayFiles}
                        panelOpen={panelOpen}
                        showFav={!isLibrary && !hasFolderPanel}
                        onPanelToggle={hasSidePanel ? () => setPanelOpen(v => !v) : null}
                        stripOpen={!!stripPref}
                        onStripToggle={mainArray.length > 1 ? () => setStripPref(!stripPref) : null}
                        onEdit={isLibrary && onUpdated && file.type === FILE_TYPES.IMAGE && !file.isManga ? () => setEditing(true) : null}
                        onApplyLast={isLibrary && onUpdated && file.type === FILE_TYPES.IMAGE && !file.isManga && loadEditPreset() ? handleApplyLast : null}
                        onDuplicate={isLibrary && onUpdated ? handleDuplicate : null}
                        onSlideshow={ss.active ? null : ss.start}
                        hidden={ss.active && !ss.paused}
                    />
                )}

                {ss.active && !editing && <SlideshowHud ss={ss} file={file} />}
                {showStrip && <Filmstrip items={mainArray} current={file} onPick={modalUpdater} onHide={() => setStripPref(false)} />}
                {!stripPref && !ss.active && !editing && mainArray.length > 1 && (
                    <button className="fs-show" onClick={() => setStripPref(true)} title="Показать ленту миниатюр (T)">
                        <i className="bi bi-chevron-up" />
                    </button>
                )}

                {/* The media area is always rendered in the same spot so toggling the
                    panel never remounts <Video> (which would restart playback). Only
                    the panel / tags sibling swaps. */}
                <div className="modal-media-area" ref={contentRef} onPointerDown={onMediaPointerDown}
                     {...swipeHandlers((dir) => {
                         // Swipe left → next, right → previous (not while zoomed in).
                         const i = mainArray.findIndex(f => f.uniqueId === file.uniqueId);
                         const next = mainArray[i - dir];
                         if (next) modalUpdater(next);
                     }, { enabled: zoom <= 1 && !editing })}>
                    <div className="modal-content-wrapper">
                        {editing ? null : mediaContent}
                    </div>
                </div>
                {showPanel && (
                    <div className="modal-panel-wrapper" data-bs-theme={uiTheme}>
                        {hasMetaPanel
                            ? <MetadataPanel file={file} onUpdated={handlePanelUpdated} />
                            : hasFolderPanel
                                ? <FolderPanel file={file} />
                                : <RemotePanel file={file} />}
                    </div>
                )}
                {/* Library keeps its old bottom-tags look when its panel is hidden. */}
                {hasMetaPanel && !panelOpen && !ss.active && <Tags file={file} />}

                {editing && (
                    <ImageEditor
                        file={file}
                        onCancel={() => setEditing(false)}
                        onSaved={() => { setEditing(false); onUpdated?.('refresh'); }}
                    />
                )}
            </dialog>
        </>
    );
};

export default Modal;
