import React, {useEffect, useRef, useState} from 'react';
import Navigation from "./Modal/Navigation";
import {FILE_TYPES} from "../ThumbFile";
import Tags from "./Modal/Tags";
import Video from "./Modal/Video";
import Settings from "../../../data/settings";

const Modal = ({ file, mainArray, modalUpdater, currentSource, displayFiles }) => {
    const [isLong, setIsLong] = useState(false);
    const [degree, setDegree] = useState(0);
    const modalRef = useRef(null);

    const fileId = file?.remoteId;

    useEffect(() => {
        if (!fileId) return;

        setIsLong(false);
        setDegree(0);

        if (modalRef.current) {
            modalRef.current.scrollTo(0, 0);
            modalRef.current.focus();
        }

        file.getSize().then((size) => {
            if (size && size.height / size.width > 2.0) {
                setIsLong(true);
            }
        });

        if (file.type === FILE_TYPES.IMAGE) {
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

    if (!file) return null;

    return (
        <dialog
            className={`modal ${file.isFav() ? "favorite" : ""}`}
            open
            ref={modalRef}
            tabIndex="-1"
        >
            <Navigation
                file={file}
                modalUpdater={modalUpdater}
                mainArray={mainArray}
                setDegree={setDegree}
                currentSource={currentSource}
                displayFiles={displayFiles}
            />

            <div className="modal-content-wrapper">
                {file.type === FILE_TYPES.IMAGE ? (
                    <img
                        key={fileId}
                        alt={file.title}
                        src={file.getUrl()}
                        className={Settings.longView && isLong ? "long" : ""}
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