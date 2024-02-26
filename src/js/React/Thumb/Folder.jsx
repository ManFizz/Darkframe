import React, {Component} from "react";
import {ClearGallery} from "../../thumb";
import {DisplayImagesByPath} from "../../folders";

const pathToImage = "images/folder.png";

class Folder extends Component {
    constructor(props) {
        super(props);

        this.handleClick = this.handleClick.bind(this);
    }

    handleClick = () => {
        ClearGallery();
        const { file } = this.props;
        DisplayImagesByPath(file.sourceUrl + '\\' + file.title).then();
    };

    render() {
        const { file } = this.props;
        return <div className="card thumb bg-dark" onClick={this.handleClick}>
            <img src={pathToImage} alt={file.title}/>
            <p className="title">{file.title}</p>
        </div>;
    }
}

export default Folder;