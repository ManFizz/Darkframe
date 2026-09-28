import React, {useContext, useEffect, useState} from 'react';
import {getViewPrefs, setViewPref} from '@services/viewPrefs';
import {createPortal} from 'react-dom';
import {BsSliders} from "react-icons/bs";
import ModuleRegistry from '@/ModuleRegistry';

import {GalleryContext} from '@/AppInitializer';
import {SOURCE_TYPES} from "@/Constants";
import {useLibraryContext} from '@/LibraryContext';
import {LibraryNavControls, LibraryNavSort} from '../Library/LibraryNavControls';
import TagManager from '../Settings/TagManager';
import ControlPanel from '../ControlPanel/ControlPanel';
import {openHotkeysHelp} from '../Helpers/HotkeysHelp';
import BooruSearchBar from '@modules/r34/BooruSearchBar';

const VIEW_ICONS = { 1: 'bi-grid-3x3-gap-fill', 2: 'bi-grid-1x2', 3: 'bi-columns-gap' };
const VIEW_NAMES = { 1: 'квадраты', 2: 'плитка', 3: 'колонки' };

const NavBar = () => {
    const { state, setCurrentSource, setTypeView, setSafeMode } = useContext(GalleryContext);
    const libraryCtx = useLibraryContext();

    const isLibrary = state.currentSource === SOURCE_TYPES.LIBRARY;
    const isFolder  = state.currentSource === SOURCE_TYPES.FOLDER;
    const [showPanel, setShowPanel] = useState(false);
    const [panelTab, setPanelTab] = useState('manage');
    const [showTags, setShowTags] = useState(false);

    const openPanel = (tab = 'manage') => { setPanelTab(tab); setShowPanel(true); };

    // Favourites now live in the library sidebar (next to "Все файлы"), so the
    // top-level button is gone.
    const navButtons = [
        { label: 'Library',  type: SOURCE_TYPES.LIBRARY },
        ...ModuleRegistry.getNavItems(),
    ];

    const [activeNav, setActiveNav] = useState(0);

    const handleNavigation = (idx) => {
        const btn = navButtons[idx];
        if (!btn) return;
        setActiveNav(idx);
        setViewPref('lastNav', idx);
        setCurrentSource(btn.type);
        if (btn.action) btn.action();
    };

    // Reopen the tab that was open last time (setting "Открывать там, где закрыл").
    useEffect(() => {
        const { restoreSession, lastNav } = getViewPrefs();
        if (restoreSession && lastNav > 0 && lastNav < navButtons.length) handleNavigation(lastNav);
    }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    return (
        // Glass top bar, themed like the rest of the app.
        <header className="navbar navbar-expand-lg sticky-top navbar-glass">
            <div className="container-fluid">
                <div className="navbar-nav flex-row flex-wrap">
                    <div className="btn-group nav-source-group">
                        {navButtons.map((btn, idx) => (
                            <React.Fragment key={btn.label}>
                                <input
                                    type="radio"
                                    className="btn-check"
                                    name="nav-radio"
                                    id={`nav-${idx}`}
                                    checked={activeNav === idx}
                                    readOnly
                                />
                                <label
                                    className="btn nav-source-tab"
                                    htmlFor={`nav-${idx}`}
                                    onClick={() => handleNavigation(idx)}
                                >
                                    {btn.label}
                                </label>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {isLibrary && libraryCtx ? (
                    <LibraryNavControls ctx={libraryCtx} />
                ) : isFolder ? (
                    <div className="navbar-spacer" />
                ) : (
                    <BooruSearchBar sourceType={state.currentSource} />
                )}

                {/* Right-side actions collapse into one glass "island" */}
                <div className="navbar-actions">
                    {isLibrary && libraryCtx ? (
                        <LibraryNavSort ctx={libraryCtx} />
                    ) : isFolder ? null : (
                        <>
                            <button
                                className="btn navbar-settings-btn"
                                onClick={() => setTypeView(null)}
                                title={`Вид сетки: ${VIEW_NAMES[state.typeView] || state.typeView}`}
                            >
                                <i className={`bi ${VIEW_ICONS[state.typeView] || 'bi-grid'}`} />
                            </button>
                            <button
                                className={`btn navbar-settings-btn ${state.safeMode ? 'on' : ''}`}
                                onClick={() => setSafeMode(!state.safeMode)}
                                title={state.safeMode ? 'Безопасный режим включён (размытие)' : 'Безопасный режим'}
                            >
                                <i className={`bi ${state.safeMode ? 'bi-eye-slash-fill' : 'bi-eye'}`} />
                            </button>
                        </>
                    )}

                    {isLibrary && (
                        <button
                            className="btn navbar-settings-btn"
                            onClick={() => setShowTags(true)}
                            title="Управление тегами"
                        >
                            <i className="bi bi-tags-fill" />
                        </button>
                    )}
                    <button
                        className="btn navbar-settings-btn"
                        onClick={openHotkeysHelp}
                        title="Горячие клавиши (?)"
                    >
                        <i className="bi bi-keyboard" />
                    </button>
                    <button
                        className="btn navbar-settings-btn"
                        onClick={() => openPanel(isLibrary ? 'manage' : 'settings')}
                        title="Панель управления"
                    >
                        <BsSliders />
                    </button>
                </div>
            </div>

            {/* Portalled to body: the glass navbar's backdrop-filter would otherwise
                make these fixed overlays position against the navbar box, not the viewport. */}
            {showPanel && createPortal(
                <ControlPanel initialTab={panelTab} onClose={() => setShowPanel(false)} />,
                document.body,
            )}
            {showTags && createPortal(
                <TagManager onClose={() => setShowTags(false)} />,
                document.body,
            )}
        </header>
    );
};

export default NavBar;