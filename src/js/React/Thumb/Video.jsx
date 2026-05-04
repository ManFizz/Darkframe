import React, {useMemo, useState} from "react";
import {BiSolidVideo} from "react-icons/bi";
import Settings from "@data/settings";
import Image from "./Image";

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
                <BiSolidVideo className="video-mark" />
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
                src={file.contentUrl || file.thumbUrl}
                onLoadedData={() => setIsLoading(false)}
                style={{ display: isLoading ? 'none' : 'block' }}
            />
            <BiSolidVideo className="video-mark" />
        </>
    );
}

export default Video;
