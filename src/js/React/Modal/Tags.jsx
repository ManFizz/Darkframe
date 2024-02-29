import React, {Component} from 'react';

class Tags extends Component {

    render() {
        const { file } = this.props;
        if(!file.tags || typeof file.tags !== 'string')
            return <></>;

        let tags = file.tags.split(" ")
        if(tags.length === 0)
            return <></>;

        return <>
            <div
                className="col-md-6 d-flex flex-wrap justify-content-center mx-auto"
                id="modal-tags"
            >

                {tags.map((tag, index) => (
                        <span key={index+tag} className="badge bg-primary m-1">{tag}</span>
                ))}
            </div>
        </>;
    };
}

export default Tags;