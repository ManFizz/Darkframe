import React, {Component} from "react";

class FavoriteTagsForm extends Component {
    render() {
        return <>
            <form className="tag-list" id="tags-fav-select">
                <div className="btn-group"> {/* Example tag block TODO*/}
                    <button type="button" className="btn btn-primary">
                        kosaki_wit
                    </button>
                    <button type="button" className="btn btn-success">
                        <i className="bi bi-plus-lg"/>
                    </button>
                    <button type="button" className="btn btn-warning">
                        <i className="bi bi-dash-lg"/>
                    </button>
                    <button type="button" className="btn btn-danger">
                        <i className="bi bi-x-lg"/>
                    </button>
                </div>
            </form>
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