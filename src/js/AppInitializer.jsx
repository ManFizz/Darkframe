import React, {Component} from 'react';
import ReactDOM from 'react-dom/client';
import NavBar from "./React/NavBar.jsx";
import Modal from "./React/Modal.jsx";
import SideBar from "./React/SideBar.jsx";
import Gallery from "./React/Gallery";
import Settings from "../../data/settings";
import CustomPagination from "./React/CustomPagination";
import {SOURCE_TYPES} from "./Display";
import {updateR34Source} from "./r34";
import {GetFavTags} from "./backend";

export const SORT_ORDER = {
    ASC: 1,
    DESC: -1,
}

export const SORT_TYPE = {
    NAME: 0,
    TIME: 1,
}

export let setGallery = () => {};
export let getGallery = () => {};
export let getCurrentSource = () => {};
export let setFavTagsArray = () => {};

class Main extends Component {

    constructor(props) {
        super(props);
        this.state = {
            displayArray: [],
            mainArray: [],
            modalFile: null,
            currentSource: SOURCE_TYPES.R34,
            favTagsArray: [],
            typeView: 2,
            sortInfo: {
                order: SORT_ORDER.DESC,
                type: SORT_TYPE.TIME,
            }
        };

        this.updateMainArray = this.updateMainArray.bind(this);
        this.updateDisplayArray = this.updateDisplayArray.bind(this);
        this.updateModalFile = this.updateModalFile.bind(this);
        this.setSource = this.setSource.bind(this);
        this.setFavTagsArray = this.setFavTagsArray.bind(this);
        this.setTypeView = this.setTypeView.bind(this);
        this.setSortInfo = this.setSortInfo.bind(this);

        setGallery = this.updateMainArray;
        getGallery = () => this.state.mainArray;
        getCurrentSource = () => this.state.currentSource;
        setFavTagsArray = this.setFavTagsArray;
        GetFavTags().then(setFavTagsArray);
    }

    updateMainArray(newArray) {
        const { displayArray, sortInfo } = this.state;
        newArray.sort((a, b) => {
            if (a.priority !== b.priority)
                return b.priority - a.priority;

            if (sortInfo.type === SORT_TYPE.NAME) {
                return a.title.toLowerCase().localeCompare(b.title.toLowerCase()) * sortInfo.order;
            }

            if (sortInfo.type === SORT_TYPE.TIME)
                return sortInfo.order * (a.time - b.time);

            return 0;
        });

        this.setState({ mainArray: newArray });

        if(newArray.length <= Settings.maxThumbsPerPage) {
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
        this.setState({modalFile: file});
    }

    setSource(source) {
        updateR34Source(source);
        this.setState({currentSource: source});
    }

    setFavTagsArray(array) {
        this.setState({favTagsArray: array});
    }

    setTypeView(newTypeView) {
        const minView = 1;
        const maxView = 3;
        const { typeView } = this.state;
        if(newTypeView === null)
            newTypeView = typeView + 1 <= maxView ? typeView + 1 : minView;

        this.setState({typeView: newTypeView});
    }

    setSortInfo({ order, type }) {
        const info = this.state.sortInfo;
        if(order !== undefined) info.order = order;
        if(type !== undefined) info.type = type;
        this.setState({sortInfo: info});
    }

    render() {
        const { displayArray, modalFile, mainArray, currentSource, favTagsArray, typeView, sortInfo} = this.state;
        return (<>
            <NavBar
                currentSource={currentSource}
                setSource={this.setSource}
                typeView={typeView}
                setTypeView={this.setTypeView}
                sortInfo={sortInfo}
                setSortInfo={this.setSortInfo}
            />
            <Modal
                file={modalFile}
                modalUpdater={this.updateModalFile}
                mainArray={mainArray}
            />
            <div className="wrapper d-flex align-items-stretch main-split overflow-auto">
                <SideBar
                    currentSource={currentSource}
                    favTagsArray={favTagsArray}
                />
                <div className="container-fluid">
                    <Gallery
                        displayFiles={displayArray}
                        modalUpdater={this.updateModalFile}
                        modalFile={modalFile}
                        typeView={typeView}
                    />
                    <ul
                        id="pagination"
                        className="pagination-sm fixed-bottom justify-content-center"
                    />
                </div>
                <CustomPagination
                    displayArray={displayArray}
                    mainArray={mainArray}
                    updateDisplayArray={this.updateDisplayArray}
                    currentSource={currentSource}
                />
            </div>
        </>);
    }
}

const domContainer = document.querySelector('#root');
const root = ReactDOM.createRoot(domContainer);
root.render(React.createElement(Main));