import React from "react";
import {displayImagesByPath} from "@modules/folder/FolderController";

const pathToImage = "images/folder.png";

const Folder = ({ file }) => {
    const handleClick = () => {
        displayImagesByPath(file.sourceUrl + '\\' + file.title);
    };

    return (
        <div className="card thumb bg-dark" onClick={handleClick}>
            <img src={pathToImage} alt={file.title} />
            <p className="title">{file.title}</p>
        </div>
    );
};

export default Folder;