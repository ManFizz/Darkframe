import React, {Component} from "react";

class FavoriteTagsForm extends Component {
    render() {
        return <>
            <form className="tag-list" id="tags-fav-select" />
            <form id="tag-fav-add">
                <div className="input-group">
                    <input
                        className="form-control"
                        type="text"
                        autoFocus=""
                        placeholder="Place tag..."
                    />
                    <button className="btn btn-secondary" type="submit">
                        <i className="bi bi-plus-lg"/>
                    </button>
                </div>
            </form>
        </>;
    }
}

export default FavoriteTagsForm;