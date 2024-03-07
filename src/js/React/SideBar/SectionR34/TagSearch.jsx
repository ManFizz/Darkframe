import React, {Component} from "react";
import {FindTag, UpdateFormTags, AddMedia} from "../../../r34";

class TagSearch extends Component {
    constructor(props) {
        super(props);

        this.searchInputRef = React.createRef();
        this.rateInputRef = React.createRef();

        this.Search = this.Search.bind(this);
        this.inputHandler = this.inputHandler.bind(this);
    }

    Search() {
        AddMedia(this.searchInputRef.current.value + " score:>=" + this.rateInputRef.current.value);
    }

    inputHandler() {
        const value = this.searchInputRef.current.value;
        FindTag(value);
        UpdateFormTags(value.split(' '));
    }

    render() {
        return <>
            <form id="tags-form">
                <div className="input-group">
                    <input
                        className="form-control"
                        type="text"
                        autoFocus=""
                        placeholder="Tags..."
                        id="tags-input"
                        ref={this.searchInputRef}
                        onInput={this.inputHandler}
                    />
                    <ul className="dropdown-menu mt-5" id="ul-tags"/>
                    <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={this.Search}
                    >
                        <i className="bi bi-search"/>
                    </button>
                </div>
                <input
                    className="form-control"
                    type="number"
                    id="rate-input"
                    name="rate-input"
                    min={0}
                    max={2000}
                    step={10}
                    defaultValue={0}
                    ref={this.rateInputRef}
                />
            </form>
            <form className="tag-list" id="tags-select"></form>
        </>;
    }
}

export default TagSearch;