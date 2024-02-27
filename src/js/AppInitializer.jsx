import React, {Component} from 'react';
import ReactDOM from 'react-dom/client';
import NavBar from "./React/NavBar.jsx";
import Modal from "./React/Modal.jsx";
import SideBar from "./React/SideBar.jsx";
import {InitMain} from "./main";
import Gallery from "./React/Gallery";
import Settings from "../../data/settings";
import CustomPagination from "./React/CustomPagination";

export let updateGallery = (newArray) => {
    throw new Error("Not created main component!")
};

export let getGallery = (newArray) => {
    throw new Error("Not created main component!")
};

class Main extends Component {

    constructor(props) {
        super(props);
        this.state = {
            displayArray: [],
            mainArray: [],
            modalFile: null,
        };

        this.updateMainArray = this.updateMainArray.bind(this);
        this.updateDisplayArray = this.updateDisplayArray.bind(this);
        this.updateModalFile = this.updateModalFile.bind(this);

        updateGallery = this.updateMainArray;
        getGallery = () => this.state.mainArray;
    }

    updateMainArray(newArray) {
        newArray.sort((a, b) => b.priority - a.priority);
        this.setState({ mainArray: newArray });

        const { displayArray } = this.state
        if(newArray.length < Settings.maxThumbsPerPage) {
            this.setState({ displayArray: newArray });
            return;
        }

        const containsAll = displayArray.every(item => newArray.includes(item));
        if(containsAll) {
            const startPost = newArray.indexOf(displayArray[0]);
            this.setState({displayArray: newArray.slice(startPost, startPost + Settings.maxThumbsPerPage)});
        }
    }

    updateDisplayArray(newArray) {
        this.setState({ displayArray: newArray });
    }

    updateModalFile(file) {
        this.setState({modalFile: file})
    }

    render() {
        const { displayArray, modalFile, mainArray} = this.state;
        return (<>
            <NavBar/>
            <Modal
                file={modalFile}
                modalUpdater={this.updateModalFile}
                displayArray={mainArray}
            />
            <div className="wrapper d-flex align-items-stretch main-split overflow-auto">
                <SideBar/>
                <div className="container-fluid">
                    <Gallery displayFiles={displayArray} modalUpdater={this.updateModalFile}/>
                    <ul
                        id="pagination"
                        className="pagination-sm fixed-bottom justify-content-center"
                    />
                </div>
                <CustomPagination
                    displayArray={displayArray}
                    mainArray={mainArray}
                    updateDisplayArray={this.updateDisplayArray}
                />
            </div>
        </>);
    }
}

const domContainer = document.querySelector('#root');
const root = ReactDOM.createRoot(domContainer);
root.render(React.createElement(Main));