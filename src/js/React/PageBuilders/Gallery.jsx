import React, {useRef} from 'react';
import Thumb from "../Thumb/Thumb";
import ScrollSensor from "../Helpers/ScrollSensor";

const Gallery = ({ modalFileId, modalUpdater, displayArray, typeView, loadNextPage }) => {
    const isLoadingRef = useRef(false);

    return (
        <div className={`gallery-view-${typeView}`} tabIndex="0" style={{ outline: 'none' }}>
            {displayArray.map((file) => (
                <Thumb
                    key={file.uniqueId}
                    file={file}
                    modalUpdater={modalUpdater}
                    isModal={modalFileId === file.uniqueId}
                />
            ))}

            <ScrollSensor
                enabled={modalFileId === null}
                onVisible={() => {
                    if (isLoadingRef.current) return;
                    isLoadingRef.current = true;
                    Promise.resolve(loadNextPage()).finally(() => {
                        isLoadingRef.current = false;
                    });
                }}
            />
        </div>
    );
};

export default React.memo(Gallery);