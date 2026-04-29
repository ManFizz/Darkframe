import React, {useContext, useState} from 'react';
import {BsCaretDownFill, BsFillGrid1X2Fill, BsSearch, BsShieldShaded} from "react-icons/bs";
import PrivateData from "../../../../data/private";
import {useDisplayImagesByPath} from "../../Controllers/FoldersController";
import {DisplayRemoteFavoriteR34} from "../../Controllers/R34FavoriteController"

import {GalleryContext} from '../../AppInitializer';
import {SORT_ORDER, SORT_TYPE, SOURCE_TYPES} from "../../Constants";
import {useFavorites} from "../../Hooks/useFavorites";

const NavBar = () => {
    const { state, setCurrentSource, setSortInfo, setTypeView, setSafeMode, setMainArray } = useContext(GalleryContext);
    const { favorites } = useFavorites();

    const [searchValue, setSearchValue] = useState('');

    const displayImagesByPath = useDisplayImagesByPath();

    const handleNavigation = (sourceType, action = null) => {
        setCurrentSource(sourceType);
        if (action) action();
    };

    const handleSearch = () => {
        if (state.currentSource === SOURCE_TYPES.R34 || state.currentSource === SOURCE_TYPES.GELBOORU) {
            //SearchMedia(searchValue);
        } else if (state.currentSource === SOURCE_TYPES.FOLDER) {
            displayImagesByPath(searchValue);
        }
    };

    const DisplayFavorites = () => {
        setMainArray([...favorites]);
    }

    const navButtons = [
        { label: 'R34', type: SOURCE_TYPES.R34 },
        { label: 'Gelbooru', type: SOURCE_TYPES.GELBOORU },
        { label: 'Favorites', type: SOURCE_TYPES.FAVORITE, action: DisplayFavorites },
        { label: 'Folders', type: SOURCE_TYPES.FOLDER, action: () => displayImagesByPath(PrivateData.startPath) },
        { label: 'R34 Favs', type: SOURCE_TYPES.R34, action: DisplayRemoteFavoriteR34 },
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

                <form className="d-flex col-5">
                    <input
                        className="form-control me-2"
                        type="search"
                        placeholder="Search"
                        onChange={(e) => setSearchValue(e.target.value)}
                    />
                    <button className="btn btn-outline-success" type="button" onClick={handleSearch}>
                        <BsSearch />
                    </button>
                </form>

                <div className="d-flex btn-group">
                    <div className="btn-group dropdown">
                        <button className="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                            Sort by {state.sortInfo.type === SORT_TYPE.NAME ? "name" : "time"}
                        </button>
                        <ul className="dropdown-menu dropdown-menu-end">
                            <li><button className="dropdown-item" onClick={() => setSortInfo({ type: SORT_TYPE.NAME })}>Name</button></li>
                            <li><button className="dropdown-item" onClick={() => setSortInfo({ type: SORT_TYPE.TIME })}>Time</button></li>
                        </ul>
                    </div>

                    <button
                        className="btn btn-outline-secondary"
                        onClick={() => setSortInfo({ order: state.sortInfo.order * -1 })}
                    >
                        Order <BsCaretDownFill className={state.sortInfo.order === SORT_ORDER.ASC ? "flip" : ""} />
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
            </div>
        </header>
    );
};

export default NavBar;