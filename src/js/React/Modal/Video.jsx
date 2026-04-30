import React, {useCallback, useRef, useState} from 'react';
import VideoControls from "./VideoControls";

const Video = ({ file }) => {
    const videoRef = useRef(null);
    const [isLooped, setIsLooped] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [isPaused, setIsPaused] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);

    const toggleLoop = useCallback(() => setIsLooped(v => !v), []);

    if (!file) return null;

    return (
        <>
            <video
                ref={videoRef}
                key={file.getUrl()}
                autoPlay
                loop={isLooped}
                muted={isMuted}
                src={file.getUrl()}
                onPause={() => setIsPaused(true)}
                onEnded={() => setIsPaused(true)}
                onPlay={() => setIsPaused(false)}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                onVolumeChange={() => setIsMuted(videoRef.current?.muted ?? false)}
                onDurationChange={() => setVideoDuration(Math.round(videoRef.current?.duration || 0))}
            />
            <VideoControls
                key={file.getUrl() + "vc"}
                video={videoRef.current}
                isLooped={isLooped}
                isMuted={isMuted}
                isPaused={isPaused}
                currentTime={currentTime}
                videoDuration={videoDuration}
                toggleLoop={toggleLoop}
            />
        </>
    );
};

export default Video;