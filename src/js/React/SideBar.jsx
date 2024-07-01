import React, { Component } from 'react';
import SectionR34 from "./SideBar/SectionR34.jsx";
import { BsList } from "react-icons/bs";
import { SOURCE_TYPES } from "../Display";

class SideBar extends Component {
    constructor(props) {
        super(props);
        this.state = {
            sidebarOpen: false,
        }
        this.toggleSidebarOpen = this.toggleSidebarOpen.bind(this);
    }

    toggleSidebarOpen() {
        this.setState(prevState => ({ sidebarOpen: !prevState.sidebarOpen }));
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const { currentSource } = this.props;
        if(currentSource !== prevProps.currentSource) {
            const isR34 = currentSource === SOURCE_TYPES.R34 || currentSource === SOURCE_TYPES.GELBOORU || currentSource === SOURCE_TYPES.REALBOORU;
            this.setState({sidebarOpen: isR34});
        }
    }

    render() {
        const { sidebarOpen } = this.state;
        const { currentSource, favTagsArray } = this.props;
        const isR34 = currentSource === SOURCE_TYPES.R34 || currentSource === SOURCE_TYPES.GELBOORU || currentSource === SOURCE_TYPES.REALBOORU;
        return <>
            <nav className={`sidebar bg-dark text-white ${sidebarOpen ? 'open' : ''}`}>
                <div className="custom-menu">
                    <button
                        className="btn btn-primary"
                        onClick={this.toggleSidebarOpen}
                    >
                        <BsList />
                    </button>
                </div>
                {isR34 && (
                    <SectionR34
                        currentSource={currentSource}
                        favTagsArray={favTagsArray}
                    />
                )}
            </nav>
        </>;
    };
}

export default SideBar;