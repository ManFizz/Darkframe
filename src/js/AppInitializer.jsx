import React, {Component} from 'react';
import ReactDOM from 'react-dom/client';
import NavBar from "./React/NavBar.jsx";
import Modal from "./React/Modal.jsx";
import SideBar from "./React/SideBar.jsx";
import {InitMain} from "./main";
import {InitThumb} from "./thumb";

const e = React.createElement;

class Main extends Component {


    componentDidMount() {
        InitThumb();
        InitMain();
    }

    render() {
        return <>
            <NavBar/>
            <Modal/>
            <div className="wrapper d-flex align-items-stretch main-split overflow-auto">
                <SideBar/>
                <div className="container-fluid" id="main-container">
                    <div className="gallery-view-1" id="gallery" />
                    <ul
                        id="pagination"
                        className="pagination-sm fixed-bottom justify-content-center"
                    />
                </div>
            </div>
        </>;
    }
}

const domContainer = document.querySelector('#root');
const root = ReactDOM.createRoot(domContainer);
root.render(e(Main));