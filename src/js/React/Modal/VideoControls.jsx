import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
    BsFastForwardFill,
    BsFillPauseFill,
    BsFillPlayFill,
    BsFillRewindFill,
    BsFillSkipEndFill,
    BsFillSkipStartFill,
    BsFillVolumeMuteFill,
    BsFillVolumeUpFill,
    BsRecordCircle,
    BsRecordCircleFill,
    BsRecycle,
    BsRepeat,
    BsRepeat1
} from "react-icons/bs";

const formatTime = (timeInSeconds) => {
    const date = new Date(timeInSeconds * 1000);
    const m = date.getMinutes();
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${m}:${s}`;
};

const VideoControls = ({ video, isLooped, isMuted, isPaused, currentTime, videoDuration, toggleLoop }) => {
    const [startRec, setStartRec] = useState(null);
    const [endRec, setEndRec] = useState(null);
    const isSpacePressed = useRef(false);
    const lastStateVideo = useRef(false);

    const skipToSec = useCallback((sec) => {
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(sec, video.duration));
    }, [video]);

    const skipSec = useCallback((seconds) => {
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration));
    }, [video]);

    const toggleMute = useCallback(() => {
        if (video) video.muted = !video.muted;
    }, [video]);

    const togglePlay = useCallback(() => {
        if (!video) return;
        (video.paused || video.ended) ? video.play() : video.pause();
    }, [video]);

    const skipAhead = useCallback((e) => {
        if (!video) return;
        const val = e.target.dataset.seek ?? e.target.value;
        if (val !== Math.round(video.currentTime))
            video.currentTime = val;
    }, [video]);

    const handleSeekMouseDown = useCallback(() => {
        if (!video) return;
        lastStateVideo.current = video.paused;
        video.pause();
    }, [video]);

    const handleSeekMouseUp = useCallback(() => {
        if (!video) return;
        if (video.paused && !lastStateVideo.current) video.play();
    }, [video]);

    const setStart = useCallback(() => {
        if (video) setStartRec(video.currentTime);
    }, [video]);

    const setEnd = useCallback(() => {
        if (video) setEndRec(video.currentTime);
    }, [video]);

    const clearRecord = useCallback(() => {
        setStartRec(null);
        setEndRec(null);
    }, []);

    useEffect(() => {
        if (!video || startRec === null || endRec === null) return;

        const handleTimeUpdate = () => {
            if (video.currentTime > endRec) skipToSec(startRec);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        return () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }, [video, startRec, endRec, skipToSec]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey) {
                if (e.key === 'ArrowLeft') skipSec(-10);
                if (e.key === 'ArrowRight') skipSec(10);
                return;
            }

            if (e.code === 'Space' || e.key === ' ') {
                const tag = document.activeElement?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                e.preventDefault();
                if (isSpacePressed.current) return;
                isSpacePressed.current = true;
                togglePlay();
            }
        };

        const handleKeyUp = (e) => {
            if (e.code === 'Space' || e.key === ' ')
                isSpacePressed.current = false;
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, [skipSec, togglePlay]);

    return (
        <div className="video-controls">
            <div className="video-misc">
                {isLooped
                    ? <BsRepeat1 onClick={toggleLoop} />
                    : <BsRepeat onClick={toggleLoop} />
                }
                {isMuted
                    ? <BsFillVolumeMuteFill onClick={toggleMute} />
                    : <BsFillVolumeUpFill onClick={toggleMute} />
                }
                {!startRec && <BsRecordCircle onClick={setStart} />}
                {startRec && !endRec && <BsRecordCircleFill onClick={setEnd} />}
                {startRec && endRec && <BsRecycle onClick={clearRecord} />}
            </div>

            <div className="time-control">
                <time id="time-elapsed">{formatTime(currentTime)}</time>
                <BsFillSkipStartFill onClick={() => skipToSec(0)} />
                <BsFillRewindFill onClick={() => skipSec(-10)} />
                {isPaused
                    ? <BsFillPlayFill onClick={togglePlay} />
                    : <BsFillPauseFill onClick={togglePlay} />
                }
                <BsFastForwardFill onClick={() => skipSec(10)} />
                <BsFillSkipEndFill onClick={() => skipToSec(Number.MAX_VALUE)} />
                <time id="duration">{formatTime(videoDuration)}</time>
            </div>

            <div className="video-progress">
                <progress value={currentTime} max={videoDuration} />
                <input
                    className="seek"
                    type="range"
                    min={0}
                    max={videoDuration}
                    step={0.25}
                    value={currentTime}
                    onChange={skipAhead}
                    onMouseDown={handleSeekMouseDown}
                    onMouseUp={handleSeekMouseUp}
                />
            </div>
        </div>
    );
};

export default VideoControls;