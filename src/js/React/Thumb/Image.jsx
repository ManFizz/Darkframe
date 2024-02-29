import React, {Component} from "react";
import Settings from "../../../../data/settings";
import {IsAnimated} from "../../Display";

const loadingUrl = "./images/loading.gif";

function resizeImage(originalImage, maxDimension = 512) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const naturalWidth = originalImage.naturalWidth;
    const naturalHeight = originalImage.naturalHeight;

    const maxDim = Math.max(naturalWidth, naturalHeight);

    const newWidth = naturalWidth * (maxDimension / maxDim);
    const newHeight = naturalHeight * (maxDimension / maxDim);

    canvas.width = newWidth;
    canvas.height = newHeight;

    context.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    originalImage.src = canvas.toDataURL('image/webp');
}

class Image extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isLoading: !Settings.resize,
            isEndLoading: Settings.resize,
        };
        this.imgRef = React.createRef();
    }

    handleImageLoad = async () => {
        if(!this.state.isLoading)
            return;

        this.setState({ isLoading: false });

        const img = this.imgRef.current;
        if(!(await IsAnimated(img.src)))
            resizeImage(img);

        this.setState({ isEndLoading: true });
    };

    render() {
        const { isEndLoading } = this.state;
        const { file } = this.props;
        return <>
            {!isEndLoading && (
                <img
                    src={loadingUrl}
                    alt="Loading"
                />
            )}
            <img
                ref={this.imgRef}
                src={file.thumbUrl}
                alt={file.title}
                onLoad={this.handleImageLoad}
                style={{ display: !isEndLoading ? 'none' : 'block' }}
            />
            {Settings.backgroundImg && (
                <img
                    className="background-overlay"
                    src={file.thumbUrl}
                    alt={file.title}
                    style={{ display: !isEndLoading ? 'none' : 'block' }}
                />
            )}
        </>;
    }
}

export default Image;