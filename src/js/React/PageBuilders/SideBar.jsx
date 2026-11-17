import React, {useEffect, useState} from 'react';
import ModuleRegistry from '@/ModuleRegistry';
import {useMobile} from '@services/mobile';

// Docked, collapsible sidebar of the booru sources (search modifiers, saved tags…).
const SideBar = ({ currentSource }) => {
    const SideSection = ModuleRegistry.getSidebarSection(currentSource);
    const [sidebarOpen, setSidebarOpen] = useState(!!SideSection);
    const mobile = useMobile();

    useEffect(() => {
        if (SideSection) setSidebarOpen(true);
    }, [currentSource, SideSection]);

    const toggle = () => setSidebarOpen(v => !v);
    return (
        <>
            {mobile && sidebarOpen && (
                <button type="button" className="sidebar-backdrop" aria-label="Закрыть панель" onClick={() => setSidebarOpen(false)} />
            )}
            <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                {!mobile && (
                    <div className="custom-menu">
                        <button
                            className="btn"
                            onClick={toggle}
                            title={sidebarOpen ? 'Скрыть панель' : 'Показать панель'}
                        >
                            <i aria-hidden="true" className={`bi ${sidebarOpen ? 'bi-chevron-left' : 'bi-chevron-right'}`} />
                        </button>
                    </div>
                )}
                {SideSection && <SideSection currentSource={currentSource} />}
            </nav>
            {mobile && (
                <button
                    type="button"
                    className={`sidebar-edge ${sidebarOpen ? 'open' : ''}`}
                    onClick={toggle}
                    title={sidebarOpen ? 'Скрыть панель' : 'Показать панель'}
                    aria-label={sidebarOpen ? 'Скрыть панель' : 'Показать панель'}
                >
                    <i aria-hidden="true" className={`bi ${sidebarOpen ? 'bi-chevron-left' : 'bi-chevron-right'}`} />
                </button>
            )}
        </>
    );
};

export default SideBar;
