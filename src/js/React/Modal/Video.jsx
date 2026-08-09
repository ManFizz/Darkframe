import React, {useCallback, useEffect, useRef, useState} from 'react';
import VideoControls from "./VideoControls";
import {FILE_TYPES} from "@/Constants";

const PLAY_MODE_KEY = 'jsg_video_playmode';
export const PLAY_MODES = ['repeat', 'next', 'shuffle'];

const loadPlayMode = () => {
    const m = localStorage.getItem(PLAY_MODE_KEY);
    return PLAY_MODES.includes(m) ? m : 'repeat';
};

const Video = ({ file, mainArray = [], modalUpdater }) => {
    const videoRef = useRef(null);
    const clickTimer = useRef(null);
    const [isPaused, setIsPaused] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [playMode, setPlayMode] = useState(loadPlayMode);

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
            />
        </>
    );
};

export default Video;
