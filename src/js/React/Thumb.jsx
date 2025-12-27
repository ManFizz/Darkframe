import React from "react";
import Image from "./Thumb/Image";
import Video from "./Thumb/Video";
import Folder from "./Thumb/Folder";
import Return from "./Thumb/Return";
import {addFav, removeFav} from "../FavController";
import {FILE_TYPES, SOURCE_TYPES} from "../ThumbFile";
import DropMenu from "./Thumb/DropMenu";
import Collection from "./Thumb/Collection";
import {getCurrentSource} from "../AppInitializer";

const Thumb = React.memo((props) => {
    const { file, isModal, modalUpdater } = props;

    const isFav = file.isFav();

    const handleLikeClick = (event) => {
        event.stopPropagation();
        if (isFav) {
            removeFav(file);
        } else {
            addFav(file);
        }
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
            case FILE_TYPES.COLLECTION: return <Collection file={file} />;
            default: return null;
        }
    };

    const hasOverlay = file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO;
    const isRemovedInFavs = !isFav && getCurrentSource() === SOURCE_TYPES.FAVORITE;
    return (
        <div
            className={`card thumb bg-dark ${isModal ? 'modal-active' : ''} ${isRemovedInFavs ? 'opacity-50' : ''}`}
            onClick={handleThumbClick}
        >
            {hasOverlay && (
                <div className="overlay">
                    <DropMenu file={file} />
                    <i
                        className={`bi ${isFav ? 'bi-ban' : 'bi-heart-fill'}`}
                        onClick={handleLikeClick}
                    ></i>
                </div>
            )}
            {renderContent()}
        </div>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.file === nextProps.file &&
        prevProps.isModal === nextProps.isModal &&
        prevProps.file.isFav() === nextProps.file.isFav()
    );
});

export default Thumb;