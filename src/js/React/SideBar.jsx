import React, {Component} from 'react';
import SectionR34 from "./SideBar/SectionR34.jsx";
import SectionFolders from "./SideBar/SectionFolders";

class SideBar extends Component {
    render() {
        return <>
            <nav className="sidebar bg-dark text-white open">
                <div className="custom-menu">
                    <button type="button" id="sidebarCollapse" className="btn btn-primary">
                        <i className="bi bi-list"/>
                    </button>
                </div>
                <SectionR34/>
                <SectionFolders/>
            </nav>
        </>;
    };
}

export default SideBar;