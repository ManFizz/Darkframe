import React, {Component} from 'react';
import TagSearch from "./SectionR34/TagSearch";
import {currentR34Source} from "../../R34Controller";

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
        return (
            <section>
                <p className="h1">{name}</p>
                <p className="h6">Search by tags</p>
                <TagSearch currentR34Source={this.props.currentSource} favTagsArray={this.props.favTagsArray} />
            </section>
        );
    }
}

export default SectionR34;
