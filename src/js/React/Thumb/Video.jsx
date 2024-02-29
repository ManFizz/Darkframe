import React, { Component } from "react";
import { BiSolidVideo } from "react-icons/bi";
import Settings from "../../../../data/settings";

const loadingUrl = "./images/loading.gif";

class Video extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isLoading: Settings.resize,
        };
        this.handleVideoLoad = this.handleVideoLoad.bind(this);
    }

    handleVideoLoad() {
        if(this.state.isLoading !== false)
            this.setState({ isLoading: false });
    };

    render() {
        const { thumbUrl, currentSection } = this.props.file;
        const { isLoading } = this.state;
        return (
            <>
                {isLoading && (
                    <img
                        src={loadingUrl}
                        alt="Loading"
                    />
                )}
                <video
                    preload="metadata"
                    autoPlay={currentSection === "section-p365"}
                    muted={true}
                    loop={true}
                    onLoadedData={this.handleVideoLoad}
                    style={{ display: isLoading ? 'none' : 'block' }}
                    src={thumbUrl}
                />
                {currentSection !== "section-p365" && (
                    <BiSolidVideo className="video-mark" />
                )}
            </>
        );
    }
}

export default Video;
