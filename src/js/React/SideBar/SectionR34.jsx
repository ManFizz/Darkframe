import React, { Component } from 'react';
import FavoriteTagsForm from "./FavoriteTagsForm";
import TagSearch from "./SectionR34/TagSearch";
import { ChangeSection } from "../../main";
import {addByIdArray, SetSource} from "../../r34";
import {BuildFavoriteTags} from "../../FavController";

class SectionR34 extends Component {

    render() {
        return (
            <section id="section-r34">
                <p className="h1" onClick={addByIdArray}>Rule 34</p>
                <p className="h6">Search by tags</p>
                <TagSearch/>
                <hr/>
                <FavoriteTagsForm/>
            </section>
        );
    }
}

export default SectionR34;
