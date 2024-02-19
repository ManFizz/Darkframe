import React, {Component} from 'react';
import {ClearGallery} from "../../thumb";
import {DisplayImagesByPath} from "../../folders";

class SectionFolders extends Component {

    componentDidMount() {
        let form = document.querySelector("#path-form");
        form.addEventListener("reset", async () => {
            ClearGallery();
        });

        form.addEventListener("submit", async (e) => {
            let input = form.querySelector("input");
            e.preventDefault();
            let line = input.value;
            input.value = "";
            await DisplayImagesByPath(line);
        });
    }

    render() {
        return <>
            <section id="section-folders" hidden>
                <form className="input-group mb-0" id="path-form">
                    <input
                        className="form-control"
                        type="text"
                        autoFocus=""
                        placeholder="Path to folder"
                    />
                    <button className="btn btn-secondary" type="submit">
                        Submit
                    </button>
                    <button className="btn btn-warning" type="reset">
                        Reset
                    </button>
                </form>
                <div className="btn-group sort-btn">
                    <button
                        className="btn btn-primary"
                        id="btn-type-sort"
                        type="button"
                        data-toggle="dropdown"
                        aria-haspopup="true"
                        aria-expanded="false"
                    >
                        Sort
                    </button>
                    <button
                        className="btn btn-primary"
                        id="btn-order-sort"
                    >
                        <i className="bi bi-caret-down-fill"/>
                    </button>
                </div>
            </section>
        </>;
    };
}

export default SectionFolders;