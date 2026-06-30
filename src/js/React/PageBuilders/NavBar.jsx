import React, {useContext, useState} from 'react';
import {BsCaretDownFill, BsFillGrid1X2Fill, BsGearFill, BsSearch, BsShieldShaded} from "react-icons/bs";
import ModuleRegistry from '@/ModuleRegistry';
import {displayImagesByPath} from '@modules/folder/FolderController';

import {GalleryContext} from '@/AppInitializer';
import {SORT_TYPE, SOURCE_TYPES} from "@/Constants";
import {SORT_ORDER} from '@hooks/library/useLibraryFilter';
import {useLibraryContext} from '@/LibraryContext';
import {LibraryNavControls, LibraryNavSort} from '../Library/LibraryNavControls';
import SettingsPanel from '../Settings/SettingsPanel';

const NavBar = () => {
    const { state, setCurrentSource, setSortInfo, setTypeView, setSafeMode } = useContext(GalleryContext);
    const libraryCtx = useLibraryContext();

    const isLibrary = state.currentSource === SOURCE_TYPES.LIBRARY;

    const [searchValue, setSearchValue] = useState('');
    const [showSettings, setShowSettings] = useState(false);

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
        <header className="navbar navbar-expand-lg sticky-top navbar-dark text-white bg-dark">
            <div className="container-fluid">
                <div className="navbar-nav flex-row flex-wrap">
                    <div className="btn-group">
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
                                    className="btn btn-outline-primary"
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

                <button
                    className="btn btn-outline-secondary ms-2 navbar-settings-btn"
                    onClick={() => setShowSettings(true)}
                    title="Настройки"
                >
                    <BsGearFill />
                </button>
            </div>

            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
        </header>
    );
};

export default NavBar;