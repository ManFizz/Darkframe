import React, {useContext, useRef} from 'react';
import Thumb from "./Thumb";
import ScrollSensor from "./ScrollSensor";
import {LoadNextPage} from "./CustomPagination";

import {GalleryContext} from '../AppInitializer';

const Gallery = () => {
    const { state, setModalFile } = useContext(GalleryContext);
    const isLoadingRef = useRef(false);

    const galleryContent = state.displayArray?.map((file) => (
        <Thumb
            key={file.uniqueId}
            file={file}
            modalUpdater={setModalFile}
            isModal={state.modalFileId === file.uniqueId}
        />
    ));

    return (
        <div className={`gallery-view-${state.typeView}`} tabIndex="0" style={{ outline: 'none' }}>
            {galleryContent}

            <ScrollSensor
                enabled={state.modalFileId === null}
                onVisible={() => {
                    if (isLoadingRef.current) return;

                    isLoadingRef.current = true;

                    console.log("Scroll reached end, loading next...");

                    Promise.resolve(LoadNextPage()).finally(() => {
                        isLoadingRef.current = false;
                    });
                }}
            />
        </div>
    );
};

export default React.memo(Gallery);