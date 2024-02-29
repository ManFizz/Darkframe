import React, {Component} from "react";
import Image from "./Thumb/Image";
import Video from "./Thumb/Video";
import Folder from "./Thumb/Folder";
import Return from "./Thumb/Return";
import * as Display from "../Display";
import {addFav, removeFav} from "../FavController";
import {FILE_TYPES} from "../Display";

class Thumb extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isFav: props.file.isFav()
        };
        props.file._updateFavStatus = this.updateFavStatus;
    }

    handleLikeClick = (event) => {
        event.stopPropagation();
        const file = this.props.file;
        if (file.isFav()) {
            removeFav(file);
        } else {
            addFav(file);
        }
    };

    handleThumbClick = () => {
        const { file, modalUpdater } = this.props;
        if(file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO)
            modalUpdater(file);
    }

    updateFavStatus = () => {
        this.setState({ isFav: this.props.file.isFav() });
    };

    render() {
        const { file, isModal } = this.props;
        return (
            <div
                className={`card thumb bg-dark ${isModal ? 'modal-active' : ''}`}
                onClick={this.handleThumbClick}
            >
                {(file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO) && (
                    <div className="overlay">
                        {this.state.isFav ? (
                            <i className="bi bi-ban" onClick={this.handleLikeClick}></i>
                        ) : (
                            <i className="bi bi-heart-fill" onClick={this.handleLikeClick}></i>
                        )}
                    </div>
                )}
                {file.type === FILE_TYPES.IMAGE ? (
                    <Image file={file}/>
                ) : file.type === FILE_TYPES.VIDEO ? (
                    <Video file={file}/>
                ) : file.type === FILE_TYPES.FOLDER ? (
                    <Folder file={file}/>
                ) : (
                    <Return file={file}/>
                )}
            </div>
        );
    }

}

export default Thumb;