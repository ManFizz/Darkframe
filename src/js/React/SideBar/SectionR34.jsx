import React, {Component} from 'react';
import FavoriteTagsForm from "./SectionR34/FavoriteTagsForm";
import TagSearch from "./SectionR34/TagSearch";
import {ChangeSection} from "../../main";

class SectionR34 extends Component {

    componentDidMount() {
        document.getElementById('nav-r34').onclick = () => ChangeSection('section-r34');
    }

    render() {
        return <>
            <section id="section-r34">
                <p className="h1">Rule 34</p>
                <p className="h6">Search by tags</p>
                <TagSearch/>
                <hr/>
                <FavoriteTagsForm/>
            </section>
        </>;
    };
}

export default SectionR34;