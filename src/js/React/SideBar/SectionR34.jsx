import React, { Component } from 'react';
import FavoriteTagsForm from "./FavoriteTagsForm";
import TagSearch from "./SectionR34/TagSearch";
import { ChangeSection } from "../../main";
import { SetSource } from "../../r34";
import {BuildFavoriteTags} from "../../FavController";

class SectionR34 extends Component {
    constructor(props) {
        super(props);
        this.handleNavClick = this.handleNavClick.bind(this);
    }

    handleNavClick(sourceName) {
        ChangeSection('section-r34');
        SetSource(sourceName);
        document.querySelector("#section-r34 .h1").innerText = sourceName;
        BuildFavoriteTags();
    }

    componentDidMount() {
        document.getElementById('nav-r34').addEventListener('click', () => this.handleNavClick("Rule 34"));
        document.getElementById('nav-gelbooru').addEventListener('click', () => this.handleNavClick("Gelbooru"));
    }

    componentWillUnmount() {
        document.getElementById('nav-r34').removeEventListener('click', this.handleNavClick);
        document.getElementById('nav-gelbooru').removeEventListener('click', this.handleNavClick);
    }

    render() {
        return (
            <section id="section-r34">
                <p className="h1">Rule 34</p>
                <p className="h6">Search by tags</p>
                <TagSearch/>
                <hr/>
                <FavoriteTagsForm/>
            </section>
        );
    }
}

export default SectionR34;
