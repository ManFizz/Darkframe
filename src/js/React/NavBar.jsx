import React, {Component} from 'react';
import {DisplayFavorites} from "../FavController";
import {DisplayImagesByPath} from "../folders";
import PrivateData from "../../../data/private";
import {AddMedia} from "../r34";
import {DisplayP365} from "../p365";
import {SOURCE_TYPES} from "../Display";
import {SORT_ORDER, SORT_TYPE} from "../AppLogic";
import {BsCaretDownFill, BsFillGrid1X2Fill, BsSearch} from "react-icons/bs";

export class NavBar extends Component {

    constructor(props) {
        super(props);
        this.state = {
            searchValue: '',
        };

        this.clickFolderHandler = this.clickFolderHandler.bind(this);
        this.clickR34Handler = this.clickR34Handler.bind(this);
        this.clickP365Handler = this.clickP365Handler.bind(this);
        this.clickFavoriteHandler = this.clickFavoriteHandler.bind(this);
        this.handleSearchInputChange = this.handleSearchInputChange.bind(this);
        this.clickSortTypeHandler = this.clickSortTypeHandler.bind(this);
        this.clickSortOrderHandler = this.clickSortOrderHandler.bind(this);
        this.clickSearchHandler = this.clickSearchHandler.bind(this);
        this.ToggleView = this.ToggleView.bind(this);
    }

    clickFolderHandler() {
        this.props.setSource(SOURCE_TYPES.FOLDER);
        DisplayImagesByPath(PrivateData.startPath).then();
    }

    clickR34Handler(sourceType) {
        this.props.setSource(sourceType);
    }

    clickP365Handler() {
        this.props.setSource(SOURCE_TYPES.P365);
        DisplayP365();
    }

    clickFavoriteHandler() {
        this.props.setSource(SOURCE_TYPES.FAVORITE);
        DisplayFavorites();
    }

    clickSortTypeHandler(newType) {
        const { setSortInfo } = this.props;
        setSortInfo({ type: newType });
    };

    clickSortOrderHandler() {
        const { sortInfo, setSortInfo } = this.props;
        setSortInfo({ order: sortInfo.order * -1 });
    };
    handleSearchInputChange(event) {
        this.setState({ searchValue: event.target.value });
    }

    clickSearchHandler() {
        const { searchValue } = this.state;
        const { currentSource } = this.props;

        switch (currentSource) {
            case SOURCE_TYPES.R34:
            case SOURCE_TYPES.GELBOORU:
            {
                AddMedia(searchValue);
                break;
            }
            case SOURCE_TYPES.FOLDER:
            {
                DisplayImagesByPath(searchValue).then();
                break;
            }
        }
    };

    ToggleView() {
        this.props.setTypeView(null);
    }

    render() {
        const renderRadioButtons = (buttons) => {
            return buttons.map((button, index) => (
                <React.Fragment key={index}>
                    <input type="radio" className="btn-check" name="btnradio" id={`btnradio${index + 1}`} autoComplete="off" defaultChecked={index === 0}/>
                    <label className="btn btn-outline-primary" htmlFor={`btnradio${index + 1}`} onClick={button.onClick}>
                        {button.label}
                    </label>
                </React.Fragment>
            ));
        };

        return <>
            <header className="navbar navbar-expand-lg sticky-top navbar-dark text-white bg-dark">
                <div className="container-xxl">
                    <div className="navbar-nav flex-row flex-wrap bd-navbar-nav">
                        <div className="btn-group">
                            {renderRadioButtons([
                                { label: 'Rule 34', onClick: () => this.clickR34Handler(SOURCE_TYPES.R34) },
                                { label: 'Gelbooru', onClick: () => this.clickR34Handler(SOURCE_TYPES.GELBOORU) },
                                { label: 'P365', onClick: this.clickP365Handler },
                                { label: 'Favorites', onClick: this.clickFavoriteHandler },
                                { label: 'Folders', onClick: this.clickFolderHandler },
                            ])}
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
                            <BsSearch />
                        </button>
                    </form>

                    <form className="d-flex btn-group">
                        <div className="btn-group dropdown">
                            <a className="btn btn-outline-secondary py-2 px-0 px-lg-2 dropdown-toggle"
                               data-bs-toggle="dropdown"
                               aria-expanded="false"
                               data-bs-display="static"
                            >
                                Sort by {this.props.sortInfo.type === SORT_TYPE.NAME ? "name" : "time"}
                            </a>
                            <ul className="dropdown-menu dropdown-menu-end">
                                <li>
                                    <a className="dropdown-item" onClick={() => this.clickSortTypeHandler(SORT_TYPE.NAME)}>Name</a>
                                </li>
                                <li>
                                    <a className="dropdown-item" onClick={() => this.clickSortTypeHandler(SORT_TYPE.TIME)}>Time</a>
                                </li>
                            </ul>
                        </div>
                        <a
                            className="btn btn-outline-secondary btn-order"
                            onClick={this.clickSortOrderHandler}
                        >
                            Sort order
                            <BsCaretDownFill
                                className={`${this.props.sortInfo.order === SORT_ORDER.ASC ? "flip" : ""}`}
                            />
                        </a>
                        <a
                            className="btn btn-outline-secondary"
                            onClick={this.ToggleView}
                        >
                            <BsFillGrid1X2Fill />
                        </a>
                    </form>
                </div>
            </header>
        </>
    };
}

export default NavBar;