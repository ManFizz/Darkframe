import React from "react";
import Image from "./Image";
import Video from "./Video";
import Folder from "./Folder";
import Return from "./Return";
import {getCurrentSource} from "../../Controllers/AppInitializerController";
import {FILE_TYPES, SOURCE_TYPES} from "../../Constants";
import {useFavorites} from "../../Hooks/useFavorites";

const Thumb = React.memo(({ file, isModal, modalUpdater }) => {

    const { isFav, toggleFav } = useFavorites();

    const handleLikeClick = (event) => {
        event.stopPropagation();
        toggleFav(file);
    };

    const handleThumbClick = () => {
        if (file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO) {
            modalUpdater(file);
        }
    };

    const renderContent = () => {
        switch (file.type) {
            case FILE_TYPES.IMAGE: return <Image file={file} />;
            case FILE_TYPES.VIDEO: return <Video file={file} />;
            case FILE_TYPES.FOLDER: return <Folder file={file} />;
            case FILE_TYPES.RETURN: return <Return file={file} />;
            default: return null;
        }
    };

    const hasOverlay = file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO;
    const isRemovedInFavs = !isFav(file.thumbUrl) && getCurrentSource() === SOURCE_TYPES.FAVORITE;

    return (
        <div
            className={`card thumb bg-dark ${isModal ? 'modal-active' : ''} ${isRemovedInFavs ? 'opacity-50' : ''}`}
            onClick={handleThumbClick}
        >
            {hasOverlay && (
                <div className="overlay">
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