import React, {Component} from "react";
import Thumb from "./Thumb";
import ScrollSensor from "./ScrollSensor";
import {LoadNextPage} from "./CustomPagination";

class Gallery extends Component {
    shouldComponentUpdate(nextProps) {
        return nextProps.displayFiles !== this.props.displayFiles ||
            nextProps.typeView !== this.props.typeView ||
            nextProps.modalFile !== this.props.modalFile;
    }

    render() {
        const { displayFiles, modalUpdater, modalFile, typeView } = this.props;
        return (
            <div className={`gallery-view-${typeView}`} tabIndex="0" style={{ outline: 'none' }}>
                {displayFiles.map((file) => (
                    <Thumb
                        key={file.uniqueId}
                        file={file}
                        modalUpdater={modalUpdater}
                        isModal={modalFile === file}
                    />
                ))}
                <ScrollSensor
                    enabled={modalFile === null}
                    onVisible={() => {
                        console.log("Scroll reached end, loading next...");
                        LoadNextPage();
                    }}
                />
            </div>
        );
    }
}

export default Gallery;