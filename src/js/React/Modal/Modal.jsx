import React, {useEffect, useMemo, useRef, useState} from 'react';
import Navigation from "./Navigation";
import Tags from "./Tags";
import Video from "./Video";
import Settings from "../../../../data/settings";
import {FILE_TYPES} from "@/Constants";
import {useFavorites} from "@hooks/useFavorites";

const Modal = ({ fileId, mainArray, modalUpdater, displayFiles }) => {
    const [isLong, setIsLong] = useState(false);
    const [degree, setDegree] = useState(0);
    const modalRef = useRef(null);
    const { isFav } = useFavorites();

    const file = useMemo(() => {
        return mainArray.find(f => f.uniqueId === fileId) || null;
    }, [fileId, mainArray]);

    useEffect(() => {
        if (!file) return;

        setIsLong(false);
        setDegree(0);

        if (modalRef.current) {
            modalRef.current.scrollTo(0, 0);
            modalRef.current.focus();
        }

        file.getSize().then(size => {
            if (size && size.height >= 1200 && size.height / size.width > 2.25) {
                setIsLong(true);
            }
        });

    }, [file]);

    useEffect(() => {
        if (!file || file.type !== FILE_TYPES.IMAGE) return;

        const index = mainArray.findIndex(f => f.uniqueId === file.uniqueId);
        if (index === -1) return;

        [index - 1, index + 1].forEach(i => {
            const neighbor = mainArray[i];
            if (neighbor?.type === FILE_TYPES.IMAGE) {
                const img = new window.Image();
                img.src = neighbor.getUrl();
            }
        });

    }, [file, mainArray]);

    if (!file) return null;

    return (
        <dialog
            className={`modal-view ${isFav(file.thumbUrl) ? "favorite" : ""}`}
            open
            ref={modalRef}
            tabIndex="-1"
        >
            <Navigation
                file={file}
                modalUpdater={modalUpdater}
                mainArray={mainArray}
                setDegree={setDegree}
                displayFiles={displayFiles}
            />

            <div className="modal-content-wrapper">
                {file.type === FILE_TYPES.IMAGE ? (
                    <img
                        key={fileId}
                        alt={file.title}
                        src={file.getUrl()}
                        className={Settings.LongView && isLong ? "long" : ""}
                        style={{ transform: `rotate(${degree}deg)` }}
                    />
                ) : (
                    <Video file={file} />
                )}
            </div>

            <Tags file={file} />
        </dialog>
    );
};

export default Modal;