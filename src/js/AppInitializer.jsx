import React, {Component} from 'react';
import ReactDOM from 'react-dom/client';
import NavBar from "./React/NavBar.jsx";
import Modal from "./React/Modal.jsx";
import SideBar from "./React/SideBar.jsx";
import Gallery from "./React/Gallery";
import CustomPagination from "./React/CustomPagination";
import {SOURCE_TYPES} from "./Display";
import { GetFavTags, UpdateCollections } from "./backend";
import {
    SORT_ORDER,
    SORT_TYPE,
    updateMainArray,
    updateTagsData,
    setSource, setTypeView, setSortInfo
} from "./AppLogic";


export let setCollections = () => {};
export let setGallery = () => {};
export let addToGallery = () => {};
export let getGallery = () => {};
export let getCurrentSource = () => {};
export let setFavTagsArray = () => {};
export let updateTags = () => {};
export let getTags = () => {};

export let getCollections = () => {};

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
            },
            tagsData: [],
            collections: [],
        };

        setGallery = updateMainArray.bind(this);
        addToGallery = (array) => {
            setGallery([...this.state.mainArray, ...array]);
        };
        setCollections = collections => {
            this.setState({ collections: collections });
            UpdateCollections(collections).then();
        }
        getCollections = () => this.state.collections;
        this.updateDisplayArray = newArray => this.setState({ displayArray: newArray });
        this.updateModalFile = (file) => this.setState({modalFile: file});
        this.setSource = setSource.bind(this);
        setFavTagsArray = (tags) => this.setState({favTagsArray: tags});
        this.setTypeView = setTypeView.bind(this);
        this.setSortInfo = setSortInfo.bind(this);
        updateTags = updateTagsData.bind(this);
        getTags = () => this.state.tagsData;
        getGallery = () => this.state.mainArray;
        getCurrentSource = () => this.state.currentSource;

        GetFavTags().then(setFavTagsArray);
    }

    render() {
        const { displayArray, modalFile, mainArray, currentSource, favTagsArray, typeView, sortInfo, tagsData,
            collections } = this.state;
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
                tagsData={tagsData}
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
                </div>
                <CustomPagination
                    displayArray={displayArray}
                    mainArray={mainArray}
                    updateDisplayArray={this.updateDisplayArray}
                    currentSource={currentSource}
                    modalFile={modalFile}
                />
            </div>
        </>);
    }
}

const domContainer = document.querySelector('#root');
const root = ReactDOM.createRoot(domContainer);
root.render(React.createElement(Main));