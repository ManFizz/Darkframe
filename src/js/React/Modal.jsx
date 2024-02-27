import React, {Component} from 'react';
import Navigation from "./Modal/Navigation";
import {FILE_TYPES, ImageFile} from "../Display";
import Tags from "./Modal/Tags";
import Video from "./Modal/Video";

class Modal extends Component {
    render() {
        const { file } = this.props;
        if(!file) return <></>;

        return <>
            <dialog className="modal" open>
                <Navigation
                    file={file}
                    modalUpdater={this.props.modalUpdater}
                    displayArray={this.props.displayArray}
                />
                {file.type === FILE_TYPES.IMAGE ? (
                    <img alt={file.title} src={file.thumbUrl}/>
                ) : (
                    <Video file={file} />
                )}
                <Tags file={file}/>
            </dialog>
        </>;
    };
}

export default Modal;