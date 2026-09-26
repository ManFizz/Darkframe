import React, {useEffect, useState} from 'react';
import ModuleRegistry from '@/ModuleRegistry';

// Docked, collapsible sidebar of the booru sources (search modifiers, saved tags…).
const SideBar = ({ currentSource }) => {
    const SideSection = ModuleRegistry.getSidebarSection(currentSource);
    const [sidebarOpen, setSidebarOpen] = useState(!!SideSection);

    useEffect(() => {
        if (SideSection) setSidebarOpen(true);
    }, [currentSource, SideSection]);

    return (
        <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
            <div className="custom-menu">
                <button
                    className="btn"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    title={sidebarOpen ? 'Скрыть панель' : 'Показать панель'}
                >
                    <i className={`bi ${sidebarOpen ? 'bi-chevron-left' : 'bi-chevron-right'}`} />
                </button>
            </div>
            {SideSection && <SideSection currentSource={currentSource} />}
        </nav>
    );
};

export default SideBar;
