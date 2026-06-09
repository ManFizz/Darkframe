import React, {useCallback} from "react";
import Image from "./Image";
import Video from "./Video";
import Folder from "./Folder";
import Return from "./Return";
import {getCurrentSource} from "@controllers/AppInitializerController";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import {useFavorites} from "@hooks/useFavorites";
import Collection from "./Collection";

const Thumb = (({ file, isModal, modalUpdater, isSelected, onOpen }) => {
    const handleClick = useCallback((e) => {
        if (file.type === FILE_TYPES.IMAGE ||
            file.type === FILE_TYPES.VIDEO ||
            file.type === FILE_TYPES.COLLECTION) {
            modalUpdater(file, e);
        }
    }, [file, modalUpdater]);

    const { isFav, toggleFav } = useFavorites();

    const handleLikeClick = (event) => {
        event.stopPropagation();
        toggleFav(file);
    };

    const handleOpenClick = (event) => {
        event.stopPropagation();
        onOpen?.(file);
    };

    const renderContent = () => {
        switch (file.type) {
            case FILE_TYPES.IMAGE: return <Image file={file} />;
            case FILE_TYPES.VIDEO: return <Video file={file} />;
            case FILE_TYPES.FOLDER: return <Folder file={file} />;
            case FILE_TYPES.RETURN: return <Return file={file} />;
            case FILE_TYPES.LIBRARY: return <Collection file={file} />;
            default: return null;
        }
    };

    const hasOverlay = file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO;
    const isRemovedInFavs = !isFav(file.thumbUrl) && getCurrentSource() === SOURCE_TYPES.FAVORITE;

    return (
        <div
            className={`card thumb bg-dark ${isModal ? 'modal-active' : ''} ${isRemovedInFavs ? 'opacity-50' : ''} ${isSelected ? 'thumb-selected' : ''}`}
            onClick={handleClick}
        >
            {hasOverlay && (
                <div className="overlay">
                    {onOpen && !isModal && (
                        <i
                            className="bi bi-arrows-fullscreen overlay-open"
                            title="Открыть"
                            onClick={handleOpenClick}
                        />
                    )}
                    <i
                        className={`bi ${isFav(file.thumbUrl) ? 'bi-ban' : 'bi-heart-fill'}`}
                        onClick={handleLikeClick}
                    />
                </div>
            )}
            {renderContent()}
        </div>
    );

});

export default Thumb;
