import React, {Component} from "react";
import {DisplayImagesByPath} from "../../FoldersController";

const pathToImage = "images/return.png";

class Return extends Component {
    handleClick = () => {
        const { file } = this.props;
        DisplayImagesByPath(file.sourceUrl).then();
    };

    render() {
        const { file } = this.props;
        return (
            <div className="card thumb bg-dark" onClick={this.handleClick}>
                <img src={pathToImage} alt={file.title} />
                <p className="title">{file.title}</p>
            </div>
        );
    }
}

export default Return;
