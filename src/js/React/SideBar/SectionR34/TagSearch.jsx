import React, {Component} from "react";
import {ClearGallery} from "../../../thumb";
import {FindTag, UpdateFormTags, AddMedia, GetCurrentSource} from "../../../r34";
import {AddFavTag} from "../../../FavController";

class TagSearch extends Component {

    componentDidMount() {
        let listForm = document.querySelector("#tags-form");
        listForm.addEventListener("submit", async (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            let input = listForm.querySelector("#tags-input");
            let inputRate = listForm.querySelector("#rate-input").value;
            ClearGallery();
            await AddMedia(input.value + " score:>=" + inputRate);
        });

        let addForm = document.querySelector('#tag-fav-add');
        addForm.addEventListener("submit", async (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            let input = addForm.querySelector("input");
            AddFavTag(input.value, GetCurrentSource().remoteType);
            console.log(GetCurrentSource(), GetCurrentSource().remoteType);
            input.value = "";
        });

        let tagInput = listForm.querySelector('input');
        tagInput.addEventListener('input', () => {
            FindTag(tagInput.value);
            UpdateFormTags(tagInput.value.split(' '));
        });
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
                    />
                    <ul className="dropdown-menu mt-5" id="ul-tags"/>
                    <button className="btn btn-secondary" type="submit">
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
                    defaultValue={0}
                />
            </form>
            <form className="tag-list" id="tags-select"></form>
        </>;
    }
}

export default TagSearch;