import React, {Component} from 'react';
import {BuildFavoriteTags, DisplayFavorites} from "../FavController";
import {ChangeSection, currentSection, SetSource, ToggleView} from "../main";
import {DisplayImagesByPath} from "../folders";
import PrivateData from "../../../data/private";
import {SetTypeSort, ToggleOrderSort} from "../foldersSort";
import {AddMedia} from "../r34";
import {DisplayP365} from "../p365";
import {ClearGallery} from "../thumb";

export class NavBar extends Component {

    constructor(props) {
        super(props);
        this.state = {
            sortOption: 'name',
            searchValue: '',
        };
    }

    clickFolderHandler = () => {
        ClearGallery();
        ChangeSection('section-folders');
        DisplayImagesByPath(PrivateData.startPath).then();
    }

    clickR34Handler = (sourceName) => {
        ClearGallery();
        ChangeSection('section-r34');
        SetSource(sourceName);
        document.querySelector("#section-r34 .h1").innerText = sourceName;
        BuildFavoriteTags();
    }

    clickP365Handler = () => {
        ClearGallery();
        ChangeSection('section-p365');
        DisplayP365();
    }

    clickFavoriteHandler = () => {
        ClearGallery();
        ChangeSection('section-favorite');
        DisplayFavorites();
    }

    clickSortHandler = (value) => {
        SetTypeSort(value);
        this.setState({ sortOption: value });
    };

    handleSearchInputChange = (event) => {
        this.setState({
            searchValue: event.target.value
        });
    }

    clickSearchHandler = () => {
        const searchValue = this.state.searchValue;
        switch (currentSection) {
            case "section-r34": {
                ClearGallery();
                AddMedia(searchValue);
                break;
            }
            case "section-p365": {
                //Nothing
                break;
            }
            case "section-favorite": {
                //Nothing
                break;
            }
            case "section-folders": {
                DisplayImagesByPath(searchValue).then();
                break;
            }
        }
    };

    render() {
        return <>
            <header className="navbar navbar-expand-lg sticky-top navbar-dark text-white bg-dark">
                <div className="container-xxl">
                    <div className="navbar-nav flex-row flex-wrap bd-navbar-nav">
                        <div className="btn-group">
                            <input type="radio" className="btn-check" name="btnradio" id="btnradio1" autoComplete="off"
                                   defaultChecked/>
                            <label className="btn btn-outline-primary" htmlFor="btnradio1"
                                   onClick={() => this.clickR34Handler("Rule 34")}>Rule 34</label>

                            <input type="radio" className="btn-check" name="btnradio" id="btnradio2"
                                   autoComplete="off"/>
                            <label className="btn btn-outline-primary" htmlFor="btnradio2"
                                   onClick={() => this.clickR34Handler("Gelbooru")}>Gelbooru</label>

                            <input type="radio" className="btn-check" name="btnradio" id="btnradio3"
                                   autoComplete="off"/>
                            <label className="btn btn-outline-primary" htmlFor="btnradio3"
                                   onClick={this.clickP365Handler}>P365</label>

                            <input type="radio" className="btn-check" name="btnradio" id="btnradio4"
                                   autoComplete="off"/>
                            <label className="btn btn-outline-primary" htmlFor="btnradio4"
                                   onClick={this.clickFavoriteHandler}>Favorites</label>

                            <input type="radio" className="btn-check" name="btnradio" id="btnradio5"
                                   autoComplete="off"/>
                            <label className="btn btn-outline-primary" htmlFor="btnradio5"
                                   onClick={this.clickFolderHandler}>Folders</label>
                        </div>
                    </div>
                    <form className="d-flex col-5" role="search">
                        <input className="form-control me-2"
                               type="search"
                               placeholder="Search"
                               aria-label="Search"
                               onChange={this.handleSearchInputChange}
                        />
                        <button
                            className="btn btn-outline-success"
                            type="button"
                            onClick={this.clickSearchHandler}
                        >
                            <i className="bi bi-search"></i>
                        </button>
                    </form>

                    <form className="d-flex btn-group">
                        <div className="btn-group dropdown">
                            <a className="btn btn-outline-secondary py-2 px-0 px-lg-2 dropdown-toggle"
                               data-bs-toggle="dropdown"
                               aria-expanded="false"
                               data-bs-display="static"
                            >
                                Sort by {this.state.sortOption}
                            </a>
                            <ul className="dropdown-menu dropdown-menu-end">
                                <li>
                                    <a className="dropdown-item" onClick={() => this.clickSortHandler('name')}>Name</a>
                                </li>
                                <li>
                                    <a className="dropdown-item" onClick={() => this.clickSortHandler('time')}>Time</a>
                                </li>
                            </ul>
                        </div>
                        <a className="btn btn-outline-secondary" onClick={ToggleOrderSort} id="btn-order-sort">
                            Sort order
                            <i className="bi bi-caret-down-fill"/>
                        </a>
                        <a className="btn btn-outline-secondary" onClick={ToggleView}>
                            <i className="bi bi-grid-1x2-fill"/>
                        </a>
                    </form>
                </div>
            </header>
        </>
    };
}

export default NavBar;