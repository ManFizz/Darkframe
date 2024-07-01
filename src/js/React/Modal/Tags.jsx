import React, { Component } from 'react';
import { GetTags } from "../../TagsController";

function isEmptyOrSpaces(str){
    return str === null || str.match(/^ *$/) !== null;
}

class Tags extends Component {
    constructor(props) {
        super(props);
    }

    renderTag = (tag) => {
        if(isEmptyOrSpaces(tag))
            return null;

        const foundTag = GetTags().find(item => item.name === tag);
        if(foundTag && foundTag.type === 6)
            return null;

        const tagTypeClass = foundTag ? `tag-type-${foundTag.type}` : 'bg-primary';
        const className = `badge m-1 ${tagTypeClass}`;
        return <span key={tag} className={className}>{tag}</span>;
    }

    render() {
        const {file} = this.props;
        if (!file.tags || typeof file.tags !== 'string')
            return <></>;

        let tags = file.tags.split(" ")
        if(tags.length === 0)
            return <></>;

        return <>
            <div
                className="col-md-6 d-flex flex-wrap justify-content-center mx-auto"
                id="modal-tags"
            >

                {tags.map((tag) => (
                  this.renderTag(tag)
                ))}
            </div>
        </>;
    };
}

export default Tags;