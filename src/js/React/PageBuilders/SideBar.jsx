import React, {useEffect, useState} from 'react';
import {BsList} from "react-icons/bs";
import ModuleRegistry from '@/ModuleRegistry';

const SideBar = ({ currentSource }) => {
    const SideSection = ModuleRegistry.getSidebarSection(currentSource);
    const [sidebarOpen, setSidebarOpen] = useState(!!SideSection);

    useEffect(() => {
        if (SideSection) setSidebarOpen(true);
    }, [currentSource, SideSection]);

    return (
        <nav className={`sidebar bg-dark text-white ${sidebarOpen ? 'open' : ''}`}>
            <div className="custom-menu">
                <button className="btn btn-primary" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    <BsList />
                </button>
            </div>
            {SideSection && <SideSection currentSource={currentSource} />}
        </nav>
    );
}

export default SideBar;