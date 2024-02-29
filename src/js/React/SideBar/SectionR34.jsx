import React, { Component } from 'react';
import FavoriteTagsForm from "./SectionR34/FavoriteTagsForm";
import TagSearch from "./SectionR34/TagSearch";
import {addByIdArray, currentR34Source} from "../../r34";

class SectionR34 extends Component {
    constructor(props) {
        super(props);
        this.state = {
            name: null,
        }
    }

    componentDidMount() {
        this.setState({name: currentR34Source.name});
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if(this.props.currentSource !== prevProps.currentSource)
            this.setState({name: currentR34Source.name});
    }

    render() {
        const { name } = this.state;
        const { favTagsArray, currentSource } = this.props;
        return (
            <section>
                <p className="h1" onClick={addByIdArray}>{name}</p>
                <p className="h6">Search by tags</p>
                <TagSearch/>
                <hr/>
                <FavoriteTagsForm
                    currentSource={currentSource}
                    favTagsArray={favTagsArray}
                />
            </section>
        );
    }
}

export default SectionR34;
