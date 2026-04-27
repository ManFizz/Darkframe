import React, {useRef} from 'react';
import Thumb from "../Thumb/Thumb";
import ScrollSensor from "../Helpers/ScrollSensor";
import {LoadNextPage} from "../Helpers/CustomPagination";

const Gallery = ({modalFileId, modalUpdater, displayArray, typeView}) => {
    const isLoadingRef = useRef(false);

    const galleryContent = displayArray.map((file) => (
        <Thumb
            key={file.uniqueId}
            file={file}
            modalUpdater={modalUpdater}
            isModal={modalFileId === file.uniqueId}
        />
    ));

    return (
        <div className={`gallery-view-${typeView}`} tabIndex="0" style={{ outline: 'none' }}>
            {galleryContent}

            <ScrollSensor
                enabled={modalFileId === null}
                onVisible={() => {
                    if (isLoadingRef.current) return;

                    isLoadingRef.current = true;

                    Promise.resolve(LoadNextPage()).finally(() => {
                        isLoadingRef.current = false;
                    });
                }}
            />
        </div>
    );
};

export default React.memo(Gallery);