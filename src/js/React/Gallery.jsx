import React, {Component} from "react";
import Thumb from "./Thumb";


class Gallery extends Component {
    render() {
        const {displayFiles, modalUpdater, modalFile, typeView} = this.props;
        return <>
            <div className={`gallery-view-${typeView}`}>
                {displayFiles.map((file, index) => (
                    <Thumb
                        key={file.thumbUrl + index}
                        file={file}
                        modalUpdater={modalUpdater}
                        isModal={modalFile === file}
                    />
                ))}
            </div>
        </>;
    }
}

export default Gallery;