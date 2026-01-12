import React, {useEffect, useRef, useState} from "react";

const loadingUrl = "./images/loading.gif";
const PREVIEW_WIDTH = 400;
const MAX_PREVIEW_HEIGHT = 600;

const Image = ({ file }) => {
    const [displaySrc, setDisplaySrc] = useState(loadingUrl);
    const [isLoaded, setIsLoaded] = useState(false);
    const imgLoaderRef = useRef(null);

    useEffect(() => {
        if (!file.thumbUrl) return;

        let targetUrl = file.thumbUrl;
        if (targetUrl.startsWith('C:') || targetUrl.startsWith('/') || targetUrl.startsWith('Users')) {
            targetUrl = `file://${targetUrl}`;
        }

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

        img.onerror = (err) => {
            console.error("Image load error. URL:", targetUrl, err);
            setDisplaySrc(targetUrl);
            imgLoaderRef.current = null;
        };

        if (!targetUrl.startsWith('file://')) {
            img.crossOrigin = "Anonymous";
        }

        img.src = targetUrl;

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