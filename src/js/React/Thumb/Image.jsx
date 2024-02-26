import React, {Component} from "react";
import Settings from "../../../../data/settings";

const loadingUrl = "./images/loading.gif";

class Image extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isLoading: true,
        };
    }

    handleImageLoad = () => {
        this.setState({ isLoading: false });
    };

    render() {
        const { isLoading } = this.state;
        const { file } = this.props;
        return <>
            {isLoading && (
                <img
                    src={loadingUrl}
                    alt="Loading"
                />
            )}
            <img
                src={file.thumbUrl}
                alt={file.title}
                onLoad={this.handleImageLoad}
                style={{ display: isLoading ? 'none' : 'block' }}
            />
            {Settings.backgroundImg && (
                <img
                    className="background-overlay"
                    src={file.thumbUrl}
                    alt={file.title}
                    style={{ display: isLoading ? 'none' : 'block' }}
                />
            )}
        </>;
    }
}

export default Image;