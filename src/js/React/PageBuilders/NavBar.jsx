import React, {useContext, useState} from 'react';
import {createPortal} from 'react-dom';
import {BsCaretDownFill, BsFillGrid1X2Fill, BsSearch, BsShieldShaded, BsSliders} from "react-icons/bs";
import ModuleRegistry from '@/ModuleRegistry';
import {displayImagesByPath} from '@modules/folder/FolderController';

import {GalleryContext} from '@/AppInitializer';
import {SORT_TYPE, SOURCE_TYPES} from "@/Constants";
import {SORT_ORDER} from '@hooks/library/useLibraryFilter';
import {useLibraryContext} from '@/LibraryContext';
import {LibraryNavControls, LibraryNavSort} from '../Library/LibraryNavControls';
import TagManager from '../Settings/TagManager';
import ControlPanel from '../ControlPanel/ControlPanel';

const NavBar = () => {
    const { state, setCurrentSource, setSortInfo, setTypeView, setSafeMode } = useContext(GalleryContext);
    const libraryCtx = useLibraryContext();

    const isLibrary = state.currentSource === SOURCE_TYPES.LIBRARY;

    const [searchValue, setSearchValue] = useState('');
    const [showPanel, setShowPanel] = useState(false);
    const [panelTab, setPanelTab] = useState('manage');
    const [showTags, setShowTags] = useState(false);

    const openPanel = (tab = 'manage') => { setPanelTab(tab); setShowPanel(true); };

    const handleNavigation = (sourceType, action = null) => {
        setCurrentSource(sourceType);
        if (action) action();
    };

    const handleSearch = () => {
        if (state.currentSource === SOURCE_TYPES.FOLDER) {
            displayImagesByPath(searchValue);
        }
    };

    // Favourites now live in the library sidebar (next to "Все файлы"), so the
    // top-level button is gone.
    const navButtons = [
        { label: 'Library',  type: SOURCE_TYPES.LIBRARY },
        ...ModuleRegistry.getNavItems(),
    ];

    return (
        <header className="navbar navbar-expand-lg sticky-top navbar-dark text-white navbar-glass">
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
                                    defaultChecked={idx === 0}
                                />
                                <label
                                    className="btn nav-source-tab"
                                    htmlFor={`nav-${idx}`}
                                    onClick={() => handleNavigation(btn.type, btn.action)}
                                >
                                    {btn.label}
                                </label>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {isLibrary && libraryCtx ? (
                    <LibraryNavControls ctx={libraryCtx} />
                ) : (
                    <form className="d-flex col-5">
                        <input
                            className="form-control me-2"
                            type="search"
                            placeholder="Search"
                            onChange={e => setSearchValue(e.target.value)}
                        />
                        <button className="btn btn-outline-success" type="button" onClick={handleSearch}>
                            <BsSearch />
                        </button>
                    </form>
                )}

                {/* Right-side actions collapse into one glass "island" */}
                <div className="navbar-actions">
                    {isLibrary && libraryCtx ? (
                        <LibraryNavSort ctx={libraryCtx} />
                    ) : (
                        <div className="d-flex btn-group">
                            <div className="btn-group dropdown">
                                <button className="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                                    Sort by {state.sortInfo.type === SORT_TYPE.NAME ? 'name' :
                                    state.sortInfo.type === SORT_TYPE.ID ? 'id' :
                                        state.sortInfo.type === SORT_TYPE.TIME ? 'time' : "priority"
                                }
                                </button>
                                <ul className="dropdown-menu dropdown-menu-end">
                                    <li><button className="dropdown-item" onClick={() => setSortInfo({ type: SORT_TYPE.ID })}>Id</button></li>
                                    <li><button className="dropdown-item" onClick={() => setSortInfo({ type: SORT_TYPE.NAME })}>Name</button></li>
                                    <li><button className="dropdown-item" onClick={() => setSortInfo({ type: SORT_TYPE.TIME })}>Time</button></li>
                                    <li><button className="dropdown-item" onClick={() => setSortInfo({ type: SORT_TYPE.PRIORITY })}>Priority</button></li>
                                </ul>
                            </div>
                            <button className="btn btn-outline-secondary" onClick={() => setSortInfo({ order: state.sortInfo.order * -1 })}>
                                Order <BsCaretDownFill className={state.sortInfo.order === SORT_ORDER.ASC ? 'flip' : ''} />
                            </button>
                            <button className="btn btn-outline-secondary" onClick={() => setTypeView(null)}>
                                <BsFillGrid1X2Fill />
                            </button>
                            <button
                                className={`btn ${state.safeMode ? 'btn-success' : 'btn-outline-secondary'}`}
                                onClick={() => setSafeMode(!state.safeMode)}
                            >
                                <BsShieldShaded />
                            </button>
                        </div>
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