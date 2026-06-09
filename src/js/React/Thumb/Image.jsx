import React, {useEffect, useRef, useState} from "react";
import {cachedMediaUrl} from "@/Infrastructure/MediaCache";

const loadingUrl = "./images/loading.gif";
const PREVIEW_WIDTH = 400;
const MAX_PREVIEW_HEIGHT = 600;

function normalizeUrl(url) {
    if (url.startsWith('C:') || url.startsWith('/') || url.startsWith('Users'))
        return `file://${url}`;
    return url;
}

const Image = ({ file }) => {
    // Когда thumbUrl уже является готовой превьюшкой (отдельный full-res contentUrl),
    // canvas-даунскейл не нужен — рисуем нативный <img> с lazy-загрузкой.
    const isPregenerated = file.getUrl() !== file.thumbUrl;

    if (isPregenerated) {
        return <PregeneratedImage thumbUrl={file.thumbUrl} />;
    }

    return <CanvasImage file={file} />;
};

const PregeneratedImage = ({ thumbUrl }) => {
    const [isLoaded, setIsLoaded] = useState(false);

    return (
        <img
            src={normalizeUrl(thumbUrl)}
            alt="preview"
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
            style={
                isLoaded
                    ? { width: '100%', display: 'block' }
                    : { opacity: 0.5, filter: 'blur(5px)', backgroundColor: '#222', width: '100%' }
            }
        />
    );
};

const CanvasImage = ({ file }) => {
    const [displaySrc, setDisplaySrc] = useState(loadingUrl);
    const [isLoaded, setIsLoaded] = useState(false);
    const imgLoaderRef = useRef(null);

    useEffect(() => {
        if (!file.thumbUrl) return;

        const targetUrl = normalizeUrl(file.thumbUrl);
        const fetchUrl  = cachedMediaUrl(targetUrl);

        const img = new window.Image();
        imgLoaderRef.current = img;

        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            const imgW = img.width || 1;
            const imgH = img.height || 1;

            const scale = PREVIEW_WIDTH / imgW;
            let targetHeight = imgH * scale;

            const isTooLong = targetHeight > MAX_PREVIEW_HEIGHT;
            const finalCanvasHeight = isTooLong ? MAX_PREVIEW_HEIGHT : targetHeight;

            canvas.width = PREVIEW_WIDTH;
            canvas.height = finalCanvasHeight;

            if (isTooLong) {
                const sourceHeight = MAX_PREVIEW_HEIGHT / scale;
                ctx.drawImage(img, 0, 0, imgW, sourceHeight, 0, 0, PREVIEW_WIDTH, MAX_PREVIEW_HEIGHT);
            } else {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }

            try {
                const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
                setDisplaySrc(resizedDataUrl);
                setIsLoaded(true);
            } catch (e) {
                console.error("Canvas toDataURL failed (CORS?):", e);
                setDisplaySrc(targetUrl);
            }

            imgLoaderRef.current = null;
        };

        let triedDirect = false;
        img.onerror = (err) => {
            // If the cache layer failed, retry once against the raw URL
            if (!triedDirect && fetchUrl !== targetUrl) {
                triedDirect = true;
                img.src = targetUrl;
                return;
            }
            console.error("Image load error. URL:", targetUrl, err);
            setDisplaySrc(targetUrl);
            imgLoaderRef.current = null;
        };

        if (!targetUrl.startsWith('file://')) {
            img.crossOrigin = "Anonymous";
        }

        img.src = fetchUrl;

        return () => {
            if (imgLoaderRef.current) {
                imgLoaderRef.current.onload = null;
                imgLoaderRef.current.onerror = null;
                imgLoaderRef.current.src = "";
            }
        };
    }, [file.thumbUrl]);

    return (
        <img
            src={displaySrc}
            alt="preview"
            style={
                isLoaded
                    ? { width: '100%', display: 'block' }
                    : { opacity: 0.5, filter: 'blur(5px)', backgroundColor: '#222', width: '100%' }
            }
            loading="lazy"
        />
    );
};

export default Image;