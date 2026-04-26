import React, {useEffect, useState} from "react";
import Image from "./Image";
import Video from "./Video";
import Folder from "./Folder";
import Return from "./Return";
import {subscribeFavorites} from "../../Controllers/FavoritesController";
import DropMenu from "./DropMenu";
import Collection from "./Collection";
import {getCurrentSource} from "../../Controllers/AppInitializerController";
import {FILE_TYPES, SOURCE_TYPES} from "../../Constants";

const Thumb = React.memo(({ file, isModal, modalUpdater }) => {

    const [isFav, setIsFav] = useState(file.isFav());

    useEffect(() => {
        const unsub = subscribeFavorites(() => {
            setIsFav(file.isFav());
        });

        return unsub;
    }, [file]);

    const handleLikeClick = (event) => {
        event.stopPropagation();
        file.ToggleFav();
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
                    />
                </div>
            )}
            {renderContent()}
        </div>
    );

});

export default Thumb;