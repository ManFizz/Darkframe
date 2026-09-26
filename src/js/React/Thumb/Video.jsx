import React, {useMemo, useState} from "react";
import Settings from "@data/settings";
import Image from "./Image";
import {cachedMediaUrl} from "@/Infrastructure/MediaCache";

const loadingUrl = "./images/loading.gif";

const Video = ({ file }) => {
    const [isLoading, setIsLoading] = useState(Settings.Resize);

    const hasThumb = useMemo(() =>
            file.thumbUrl?.trim() && file.thumbUrl !== file.contentUrl,
        [file.thumbUrl, file.contentUrl]
    );

    if (hasThumb) {
        return (
            <>
                <Image file={file} />
                <span className="video-mark"><i className="bi bi-play-fill" /></span>
            </>
        );
    }

    return (
        <>
            {isLoading && <img src={loadingUrl} alt="Loading" />}
            <video
                preload="metadata"
                muted
                loop
                src={cachedMediaUrl(file.contentUrl || file.thumbUrl)}
                onLoadedData={() => setIsLoading(false)}
                style={{ display: isLoading ? 'none' : 'block' }}
            />
            <span className="video-mark"><i className="bi bi-play-fill" /></span>
        </>
    );
}

export default Video;
