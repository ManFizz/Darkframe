import React, { Component } from "react";
import { LazyLoadImage } from "react-lazy-load-image-component";

const loadingUrl = "./images/loading.gif";

class Image extends Component {
    render() {
        const { file } = this.props;
        return <>
            <LazyLoadImage src={file.thumbUrl}
            />
        </>;
    }
}

export default Image;