import React, {Component} from "react";
import Image from "./Thumb/Image";
import Video from "./Thumb/Video";
import Folder from "./Thumb/Folder";
import Return from "./Thumb/Return";
import * as Display from "../Display";
import {addFav, removeFav} from "../FavController";

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
        if(file instanceof Display.ImageFile || file instanceof Display.VideoFile)
            modalUpdater(file);
    }

    updateFavStatus = () => {
        this.setState({ isFav: this.props.file.isFav() });
    };

    render() {
        const { file } = this.props;
        return (
            <div
                key={this.props.index}
                className="card thumb bg-dark"
                onClick={this.handleThumbClick}
            >
                {(file instanceof Display.ImageFile || file instanceof Display.VideoFile) && (
                    <div className="overlay">
                        {this.state.isFav ? (
                            <i className="bi bi-ban" onClick={this.handleLikeClick}></i>
                        ) : (
                            <i className="bi bi-heart-fill" onClick={this.handleLikeClick}></i>
                        )}
                    </div>
                )}
                {file instanceof Display.ImageFile ? (
                    <Image file={file}/>
                ) : file instanceof Display.VideoFile ? (
                    <Video file={file}/>
                ) : file instanceof Display.Folder ? (
                    <Folder file={file}/>
                ) : (
                    <Return file={file}/>
                )}
            </div>
        );
    }

}

export default Thumb;