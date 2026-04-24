import React, {useEffect, useState} from 'react';
import SectionR34 from "../SideBar/SectionR34.jsx";
import {BsList} from "react-icons/bs";

import {SOURCE_TYPES} from "../../Constants";

const SideBar = ({ currentSource, favTagsArray }) => {
    const isR34Family = [SOURCE_TYPES.R34, SOURCE_TYPES.GELBOORU, SOURCE_TYPES.REALBOORU].includes(currentSource);
    const [sidebarOpen, setSidebarOpen] = useState(isR34Family);

    useEffect(() => {
        if (isR34Family) setSidebarOpen(true);
    }, [currentSource, isR34Family]);

    return (
        <nav className={`sidebar bg-dark text-white ${sidebarOpen ? 'open' : ''}`}>
            <div className="custom-menu">
                <button className="btn btn-primary" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    <BsList />
                </button>
            </div>
            {isR34Family && (
                <SectionR34 currentSource={currentSource} favTagsArray={favTagsArray} />
            )}
        </nav>
    );
}

export default SideBar;