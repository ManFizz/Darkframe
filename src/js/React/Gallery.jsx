import React, {Component} from "react";
import Thumb from "./Thumb";

class Gallery extends Component {
    render() {
        return <>
            <div className="gallery-view-2" id="gallery">
                {this.props.displayFiles.map((file, index) => (
                    <Thumb key={file.thumbUrl} file={file} index={index} modalUpdater={this.props.modalUpdater}/>
                ))}
            </div>
        </>;
    }
}

export default Gallery;