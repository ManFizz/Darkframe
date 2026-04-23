import React, {useEffect, useMemo, useRef, useState} from 'react';
import Navigation from "./Modal/Navigation";
import Tags from "./Modal/Tags";
import Video from "./Modal/Video";
import Settings from "../../../data/settings";
import {FILE_TYPES} from "../Constants";

const Modal = ({ fileId, mainArray, modalUpdater, currentSource, displayFiles }) => {
    const [isLong, setIsLong] = useState(false);
    const [degree, setDegree] = useState(0);
    const modalRef = useRef(null);

    const file = useMemo(() => {
        return mainArray.find(f => f.uniqueId === fileId);
    }, [fileId, mainArray]);

    useEffect(() => {
        if (!fileId) return;

        setIsLong(false);
        setDegree(0);

        if (modalRef.current) {
            modalRef.current.scrollTo(0, 0);
            modalRef.current.focus();
        }

        actualFile.getSize().then((size) => {
            if (size && size.height >= 1200 && size.height / size.width > 2.25) {
                setIsLong(true);
            }
        });

        if (actualFile.type === FILE_TYPES.IMAGE) {
            const index = mainArray.findIndex(f => String(f.remoteId) === String(fileId));
            if (index !== -1) {
                [index - 1, index + 1].forEach(i => {
                    const neighbor = mainArray[i];
                    if (neighbor && neighbor.type === FILE_TYPES.IMAGE) {
                        const img = new window.Image();
                        img.src = neighbor.getUrl();
                    }
                });
            }
        }
    }, [fileId]);

    const actualFile = useMemo(() => {
        if (!file) return null;

        return mainArray.find(f => f.uniqueId === file.uniqueId) || file;
    }, [file, mainArray]);

    if (!actualFile) return null;

    return (
        <dialog
            className={`modal ${actualFile.isFav() ? "favorite" : ""}`}
            open
            ref={modalRef}
            tabIndex="-1"
        >
            <Navigation
                file={actualFile}
                modalUpdater={modalUpdater}
                mainArray={mainArray}
                setDegree={setDegree}
                currentSource={currentSource}
                displayFiles={displayFiles}
            />

            <div className="modal-content-wrapper">
                {actualFile.type === FILE_TYPES.IMAGE ? (
                    <img
                        key={fileId}
                        alt={actualFile.title}
                        src={actualFile.getUrl()}
                        className={Settings.LongView && isLong ? "long" : ""}
                        style={{ transform: `rotate(${degree}deg)` }}
                    />
                ) : (
                    <Video file={actualFile} />
                )}
            </div>

            <Tags file={actualFile} />
        </dialog>
    );
};

export default Modal;