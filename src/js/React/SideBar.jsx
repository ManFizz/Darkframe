import React, {Component} from 'react';
import SectionR34 from "./SideBar/SectionR34.jsx";
import SectionFolders from "./SideBar/SectionFolders";
import {BsList} from "react-icons/bs";

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
    render() {
        const { sidebarOpen } = this.state;
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
                <SectionR34/>
                <SectionFolders/>
            </nav>
        </>;
    };
}

export default SideBar;