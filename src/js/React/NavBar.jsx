import React, {useState} from 'react';
import {BsCaretDownFill, BsFillGrid1X2Fill, BsSearch, BsShieldShaded} from "react-icons/bs";
import PrivateData from "../../../data/private";
import {SOURCE_TYPES} from "../ThumbFile";
import {SORT_ORDER, SORT_TYPE} from "../AppLogic";

import {DisplayFavorites} from "../FavController";
import {DisplayImagesByPath} from "../FoldersController";
import {DisplayP365} from "../p365";
import {DisplayCollections} from "../CollectionLogic";
import {DisplayRemoteFavoriteR34} from "../r34Favorite";

const NavBar = ({ setSource, setSortInfo, sortInfo, setTypeView, currentSource, safeMode, setSafeMode }) => {
    const [searchValue, setSearchValue] = useState('');

    const handleNavigation = (sourceType, action = null) => {
        setSource(sourceType);
        if (action) action();
    };

    const handleSearch = () => {
        if (currentSource === SOURCE_TYPES.R34 || currentSource === SOURCE_TYPES.GELBOORU) {
            //SearchMedia(searchValue);
        } else if (currentSource === SOURCE_TYPES.FOLDER) {
            DisplayImagesByPath(searchValue);
        }
    };

    const navButtons = [
        { label: 'R34', type: SOURCE_TYPES.R34 },
        { label: 'Gelbooru', type: SOURCE_TYPES.GELBOORU },
        //{ label: 'Realbooru', type: SOURCE_TYPES.REALBOORU, action: WorkRealBooru },
        { label: 'P365', type: SOURCE_TYPES.P365, action: DisplayP365 },
        { label: 'Favorites', type: SOURCE_TYPES.FAVORITE, action: DisplayFavorites },
        { label: 'Folders', type: SOURCE_TYPES.FOLDER, action: () => DisplayImagesByPath(PrivateData.startPath) },
        { label: 'R34 Favs', type: SOURCE_TYPES.R34, action: DisplayRemoteFavoriteR34 },
        { label: 'Collections', type: SOURCE_TYPES.COLLECTION, action: DisplayCollections },
    ];

    return (
        <header className="navbar navbar-expand-lg sticky-top navbar-dark text-white bg-dark">
            <div className="container-fluid">
                <div className="navbar-nav flex-row flex-wrap">
                    <div className="btn-group">
                        {navButtons.map((btn, idx) => (
                            <React.Fragment key={btn.label}>
                                <input type="radio" className="btn-check" name="nav-radio" id={`nav-${idx}`} defaultChecked={idx === 0} />
                                <label className="btn btn-outline-primary" htmlFor={`nav-${idx}`} onClick={() => handleNavigation(btn.type, btn.action)}>
                                    {btn.label}
                                </label>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <form className="d-flex col-5">
                    <input className="form-control me-2" type="search" placeholder="Search" onChange={(e) => setSearchValue(e.target.value)} />
                    <button className="btn btn-outline-success" type="button" onClick={handleSearch}><BsSearch /></button>
                </form>

                <div className="d-flex btn-group">
                    <div className="btn-group dropdown">
                        <button className="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                            Sort by {sortInfo.type === SORT_TYPE.NAME ? "name" : "time"}
                        </button>
                        <ul className="dropdown-menu dropdown-menu-end">
                            <li><button className="dropdown-item" onClick={() => setSortInfo({ type: SORT_TYPE.NAME })}>Name</button></li>
                            <li><button className="dropdown-item" onClick={() => setSortInfo({ type: SORT_TYPE.TIME })}>Time</button></li>
                        </ul>
                    </div>

                    <button className="btn btn-outline-secondary" onClick={() => setSortInfo({ order: sortInfo.order * -1 })}>
                        Order <BsCaretDownFill className={sortInfo.order === SORT_ORDER.ASC ? "flip" : ""} />
                    </button>

                    <button className="btn btn-outline-secondary" onClick={() => setTypeView(null)}><BsFillGrid1X2Fill /></button>

                    <button className={`btn ${safeMode ? 'btn-success' : 'btn-outline-secondary'}`} onClick={() => setSafeMode(!safeMode)}>
                        <BsShieldShaded />
                    </button>
                </div>
            </div>
        </header>
    );
};

export default NavBar;