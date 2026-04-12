import React, {useCallback, useEffect, useState} from 'react';
import ReactDOM from 'react-dom/client';
import NavBar from "./React/NavBar.jsx";
import Modal from "./React/Modal.jsx";
import SideBar from "./React/SideBar.jsx";
import Gallery from "./React/Gallery";
import CustomPagination from "./React/CustomPagination";

import {SOURCE_TYPES} from "./ThumbFile";
import {GetFavTags, InitDatabaseData, UpdateCollections} from "./backend";
import {getNextViewType, getSortedArray, SORT_ORDER, SORT_TYPE} from "./AppLogic";
import Settings from "../../data/settings";
import {updateR34Source} from "./R34Controller";
import {StopR34Loading} from "./r34Favorite";


export let setCollections = () => {};
export let setGallery = () => {};
export let addToGallery = () => {};
export let getGallery = () => [];
export let getCurrentSource = () => {};
export let setFavTagsArray = () => {};
export let getCollections = () => [];
export let setTypeView = () => {};

const Main = () => {
    const [tagsVersion, setTagsVersion] = useState(0);
    const [mainArray, setMainArray] = useState([]);
    const [displayArray, setDisplayArray] = useState([]);
    const [modalFile, setModalFile] = useState(null);
    const [currentSource, setCurrentSource] = useState(SOURCE_TYPES.R34);
    const [favTagsArray, setFavTagsArrayState] = useState([]);
    const [typeView, updateTypeView] = useState(2);
    const [sortInfo, setSortInfoState] = useState({ order: SORT_ORDER.DESC, type: SORT_TYPE.TIME });
    const [collections, setCollectionsState] = useState([]);
    const [safeMode, setSafeMode] = useState(Settings.SafeView);

    const handleTypeViewChange = useCallback((newValue) => {
        if ([1, 2, 3].includes(newValue)) {
            updateTypeView(newValue);
        } else if (newValue === null) {
            updateTypeView(prev => getNextViewType(prev));
        }
    }, []);

    useEffect(() => {
        InitDatabaseData().then();
        GetFavTags().then(setFavTagsArrayState);

        import('./TagsController').then(module => {
            module.setOnTagsUpdate(() => {
                setTagsVersion(v => v + 1);
            });
        });

        setFavTagsArray = (tags) => setFavTagsArrayState(tags);
        getCurrentSource = () => currentSource;
        getCollections = () => collections;
        getGallery = () => mainArray;
        setTypeView = handleTypeViewChange;

        setCollections = (newCollections) => {
            setCollectionsState(newCollections);
            UpdateCollections(newCollections).then();
        };

        addToGallery = (newItems) => setMainArray(prev => [...prev, ...newItems]);

        setGallery = (newArray) => {
            const sorted = getSortedArray(newArray, sortInfo);
            setMainArray(sorted);

            let startPost = 0;
            if(displayArray[0] !== null) {
                startPost = sorted.findIndex(item => item?.uniqueId === displayArray[0]?.uniqueId);
                if (startPost === -1) startPost = 0;
            }
            setDisplayArray(sorted.slice(startPost, startPost + Settings.MaxThumbsPerPage));
        };

        return () => {
            import('./TagsController').then(module => module.setOnTagsUpdate(() => {}));
        };

    }, [mainArray, displayArray, sortInfo, collections, currentSource, handleTypeViewChange]);

    // Обработчики действий
    const handleSetSortInfo = (newInfo) => {
        const updatedSortInfo = { ...sortInfo, ...newInfo };
        setSortInfoState(updatedSortInfo);

        const sorted = getSortedArray(mainArray, updatedSortInfo);
        setMainArray(sorted);
        setDisplayArray(sorted.slice(0, Settings.MaxThumbsPerPage));
    };

    const handleSetSource = (newSource) => {
        StopR34Loading();
        updateR34Source(newSource);
        setCurrentSource(newSource);
        setMainArray([]);
        setDisplayArray([]);
    };

    return (
        <div className={`main-root ${safeMode ? "safe-view" : ""}`}>
            <NavBar
                currentSource={currentSource}
                setSource={handleSetSource}
                typeView={typeView}
                setTypeView={setTypeView}
                sortInfo={sortInfo}
                setSortInfo={handleSetSortInfo}
                safeMode={safeMode}
                setSafeMode={setSafeMode}
            />

            <Modal
                file={modalFile}
                modalUpdater={setModalFile}
                mainArray={mainArray}
                currentSource={currentSource}
                displayFiles={displayArray}
            />

            <div className="wrapper d-flex align-items-stretch main-split overflow-auto">
                <SideBar
                    currentSource={currentSource}
                    favTagsArray={favTagsArray}
                />

                <div className="container-fluid">
                    <Gallery
                        displayFiles={displayArray}
                        modalUpdater={setModalFile}
                        modalFile={modalFile}
                        typeView={typeView}
                    />
                </div>

                <CustomPagination
                    displayArray={displayArray}
                    mainArray={mainArray}
                    updateDisplayArray={setDisplayArray}
                    currentSource={currentSource}
                    modalFile={modalFile}
                />
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Main />);