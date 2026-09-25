import React, {useCallback, useEffect, useRef, useState} from 'react';
import VideoControls from "./VideoControls";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import LibraryService from "@services/LibraryService";
import {notify} from "@services/NotificationService";

const PLAY_MODE_KEY = 'jsg_video_playmode';
export const PLAY_MODES = ['repeat', 'next', 'shuffle'];

const loadPlayMode = () => {
    const m = localStorage.getItem(PLAY_MODE_KEY);
    return PLAY_MODES.includes(m) ? m : 'repeat';
};

// canEdit  — a library video the user may modify (trim etc.)
// onEdited — called after the file changed on disk, so the list reloads fresh URLs
const Video = ({ file, mainArray = [], modalUpdater, canEdit = false, onEdited }) => {
    const videoRef = useRef(null);
    const clickTimer = useRef(null);
    const [isPaused, setIsPaused] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [playMode, setPlayMode] = useState(loadPlayMode);
    const [busy, setBusy] = useState(null);   // { label, percent } while an edit runs

    // Run a file-replacing edit. The <video> is unloaded first: on Windows a file that
    // is still being streamed can't be overwritten. On failure the source is restored;
    // on success onEdited() reloads the list and the new URL remounts the player.
    const runFileEdit = useCallback(async (label, action, doneMessage) => {
        const v = videoRef.current;
        const { ipcRenderer } = window.require('electron');
        const onProgress = (_, p) => {
            if (p?.id === file.id) setBusy({ label, percent: p.percent });
        };
        ipcRenderer.on('library:videoEditProgress', onProgress);
        setBusy({ label, percent: null });

        const src = v?.getAttribute('src');
        if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
        try {
            await action();
            notify({ message: doneMessage, type: 'success' });
            onEdited?.();
        } catch (e) {
            notify({ message: `Не удалось: ${e.message}`, type: 'danger', duration: 8000 });
            if (v && src) { v.setAttribute('src', src); v.load(); }
        } finally {
            ipcRenderer.removeListener('library:videoEditProgress', onProgress);
            setBusy(null);
        }
    }, [file, onEdited]);

    // Save the current frame as a new image in the library. Works for any source:
    // a library video by id (same collection/tags), remote/folder videos by URL/path.
    const captureFrame = useCallback(async () => {
        const v = videoRef.current;
        if (!v || !file) return;
        const time = v.currentTime;
        setBusy({ label: 'Сохранение кадра', percent: null });
        try {
            const isLib = file.remoteType === SOURCE_TYPES.LIBRARY && file.id;
            await LibraryService.captureVideoFrame(isLib
                ? { itemId: file.id, time }
                : { url: file.getUrl(), time, title: file.title, tags: file.tags || [], sourceUrl: file.sourceUrl || '' });
            notify({ message: 'Кадр сохранён в библиотеку', type: 'success' });
            if (canEdit) onEdited?.();
        } catch (e) {
            notify({ message: `Не удалось сохранить кадр: ${e.message}`, type: 'danger', duration: 8000 });
        } finally {
            setBusy(null);
        }
    }, [file, canEdit, onEdited]);

    const tools = file ? {
        captureFrame,
        // Library-only edits that rewrite the file:
        ...(canEdit ? {
            canRevert: !!file.editedAt,
            trim: ({ start, end, mode, backup }) => runFileEdit(
                'Обрезка',
                () => LibraryService.trimVideo(file.id, { start, end, mode, backup }),
                'Видео обрезано',
            ),
            revert: () => runFileEdit(
                'Откат',
                () => LibraryService.revertVideo(file.id),
                'Восстановлен оригинал видео',
            ),
        } : {}),
    } : null;

    // "next"/"shuffle" need somewhere to jump to; without navigation we can only loop.
    const canAdvance = typeof modalUpdater === 'function' && mainArray.length > 0;
    const loop = playMode === 'repeat' || !canAdvance;

    const cyclePlayMode = useCallback(() => {
        setPlayMode(prev => {
            const next = PLAY_MODES[(PLAY_MODES.indexOf(prev) + 1) % PLAY_MODES.length];
            localStorage.setItem(PLAY_MODE_KEY, next);
            return next;
        });
    }, []);

    // When a clip ends in next/shuffle mode, move to another video in the list.
    const advance = useCallback(() => {
        if (!canAdvance) return;
        const videos = mainArray.filter(f => f.type === FILE_TYPES.VIDEO);
        if (videos.length <= 1) {
            const v = videoRef.current;
            if (v) { v.currentTime = 0; v.play().catch(() => {}); }
            return;
        }
        const idx = videos.findIndex(f => String(f.uniqueId) === String(file.uniqueId));
        let target;
        if (playMode === 'shuffle') {
            let r = idx;
            while (r === idx) r = Math.floor(Math.random() * videos.length);
            target = videos[r];
        } else {
            target = videos[(idx + 1) % videos.length];
        }
        modalUpdater(target);
    }, [canAdvance, mainArray, file, playMode, modalUpdater]);

    // Single click toggles play, double click toggles fullscreen. The short timer
    // stops a double click from also firing the single-click play/pause.
    const handleClick = useCallback(() => {
        if (clickTimer.current) return;
        clickTimer.current = setTimeout(() => {
            clickTimer.current = null;
            const v = videoRef.current;
            if (v) (v.paused || v.ended) ? v.play().catch(() => {}) : v.pause();
        }, 200);
    }, []);

    const handleDoubleClick = useCallback(() => {
        if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
        const v = videoRef.current;
        if (!v) return;
        // Fullscreen the whole modal so the control bar comes along, not just the video.
        const target = v.closest('.modal-view') || v;
        document.fullscreenElement ? document.exitFullscreen() : target.requestFullscreen?.();
    }, []);

    useEffect(() => () => clearTimeout(clickTimer.current), []);

    if (!file) return null;

    return (
        <>
            <video
                ref={videoRef}
                key={file.getUrl()}
                autoPlay
                loop={loop}
                src={file.getUrl()}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onPause={() => setIsPaused(true)}
                onEnded={() => { setIsPaused(true); if (!loop) advance(); }}
                onPlay={() => setIsPaused(false)}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                onDurationChange={() => setVideoDuration(videoRef.current?.duration || 0)}
            />
            <VideoControls
                key={file.getUrl() + "vc"}
                video={videoRef.current}
                isPaused={isPaused}
                currentTime={currentTime}
                videoDuration={videoDuration}
                playMode={playMode}
                cyclePlayMode={cyclePlayMode}
                tools={tools}
                busy={busy}
            />
        </>
    );
};

export default Video;
