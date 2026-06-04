import React from 'react';

const Collection = ({ file }) => {
    const { itemCount } = file._meta || {};

    return (
        <div className="collection-thumb">
            <div className="collection-thumb-icon">
                <i className="bi bi-folder-fill" />
            </div>
            <div className="collection-thumb-info">
                <span className="collection-thumb-name">{file.title}</span>
                <span className="collection-thumb-count">
                    {itemCount ?? 0} файлов
                </span>
            </div>
        </div>
    );
};

export default Collection;