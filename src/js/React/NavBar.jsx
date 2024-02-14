import React, {Component} from 'react';
import {DisplayFavorites} from "../FavController";

export class NavBar extends Component {

    componentDidMount() {
        document.getElementById('nav-fav').addEventListener('click', DisplayFavorites);
    }

    render() {
        return <>
            <nav className="navbar navbar-expand-lg sticky-top navbar-dark text-white bg-dark">
                <div className="container-lg">
                    <div className="btn-group">
                        <button className="btn btn-primary" id="nav-toggle-view">
                            <i className="bi bi-grid-1x2-fill"/>
                        </button>
                        <button className="btn btn-primary" id="nav-fav">
                            Favorites
                        </button>
                        <button className="btn btn-primary" id="nav-fold">
                            Folders
                        </button>
                        <button
                            type="button"
                            className="dropdown-toggle dropdown btn  btn-primary"
                            data-bs-toggle="dropdown"
                        >
                            Sites
                            <ul className="dropdown-menu">
                                <li className="dropdown-item">
                                    <a className="dropdown-item" id="nav-r34">Rule 34</a>
                                </li>
                                <li className="dropdown-item">
                                    <a className="dropdown-item" id="nav-gelbooru">Gelbooru</a>
                                </li>
                                <li className="dropdown-item">
                                    <a className="dropdown-item" id="nav-p365">P365</a>
                                </li>
                            </ul>
                        </button>
                    </div>
                </div>
            </nav>
        </>;
    };
}

export default NavBar;