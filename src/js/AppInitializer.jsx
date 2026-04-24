import React, {createContext, useEffect, useMemo, useReducer} from 'react';
import ReactDOM from 'react-dom/client';

import NavBar from "./React/NavBar.jsx";
import Modal from "./React/Modal.jsx";
import SideBar from "./React/SideBar.jsx";
import Gallery from "./React/Gallery";
import CustomPagination from "./React/CustomPagination";

import {GetFavTags, InitDatabaseData} from "./backend";
import {getNextViewType, getSortedArray, SORT_ORDER, SORT_TYPE} from "./AppLogic";
import Settings from "../../data/settings";
import {updateR34Source} from "./Controllers/R34Controller";
import {StopR34Loading} from "./r34Favorite";
import {SOURCE_TYPES} from "./Constants";
import Notifications from "./React/Notifications";

export const GalleryContext = createContext(null);

const initialState = {
    mainArray: [],
    displayArray: [],
    favTagsArray: [],
    collections: [],
    currentSource: SOURCE_TYPES.FOLDER,
    typeView: 2,
    sortInfo: { order: SORT_ORDER.DESC, type: SORT_TYPE.TIME },
    safeMode: Settings.SafeView,
    tagsVersion: 0,
    modalFileId: null,
};

const galleryReducer = (state, action) => {
    switch (action.type) {
        case 'SET_MAIN_ARRAY': {
            const sorted = getSortedArray(action.payload, state.sortInfo, state.currentSource);
            return {
                ...state,
                mainArray: sorted,
                displayArray: sorted.slice(0, Settings.MaxThumbsPerPage)
            };
        }
        case 'SET_DISPLAY_ARRAY': return { ...state, displayArray: action.payload };
        case 'ADD_TO_GALLERY': return { ...state, mainArray: [...state.mainArray, ...action.payload] };
        case 'SET_FAV_TAGS': return { ...state, favTagsArray: action.payload };
        case 'SET_COLLECTIONS': return { ...state, collections: action.payload };
        case 'SET_CURRENT_SOURCE': return { ...state, currentSource: action.payload, mainArray: [], displayArray: [] };
        case 'SET_TYPE_VIEW': return { ...state, typeView: action.payload };
        case 'SET_SORT_INFO':
            const sorted = getSortedArray(state.mainArray, action.payload, state.currentSource);
            return { ...state, sortInfo: action.payload, mainArray: sorted, displayArray: sorted.slice(0, Settings.MaxThumbsPerPage) };
        case 'SET_MODAL_FILE': return { ...state, modalFileId: action.payload };
        case 'SET_SAFE_MODE': return { ...state, safeMode: action.payload };
        case 'INCREMENT_TAGS_VERSION': return { ...state, tagsVersion: state.tagsVersion + 1 };
        case 'UPDATE_FILE': {
            const updatedMain = state.mainArray.map(f =>
                f.uniqueId === action.payload.uniqueId ? action.payload : f
            );

            const updatedDisplay = state.displayArray.map(f =>
                f.uniqueId === action.payload.uniqueId ? action.payload : f
            );

            return {
                ...state,
                mainArray: updatedMain,
                displayArray: updatedDisplay
            };
        }
        default: return state;
    }
};

export let setCollections = () => {};
export let setGallery = () => {};
export let addToGallery = () => {};
export let getGallery = () => [];
export let getCurrentSource = () => {};
export let setFavTagsArray = () => {};
export let getCollections = () => [];
export let setTypeView = () => {};
export let updateGalleryFile = () => {};

const Main = () => {
    const [state, dispatch] = useReducer(galleryReducer, initialState);

    const contextValue = useMemo(() => ({
        state,
        dispatch,
        setMainArray: (arr) => dispatch({ type: 'SET_MAIN_ARRAY', payload: arr }),
        addToGallery: (items) => dispatch({ type: 'ADD_TO_GALLERY', payload: items }),
        setDisplayArray: (arr) => dispatch({ type: 'SET_DISPLAY_ARRAY', payload: arr }),
        setFavTagsArray: (tags) => dispatch({ type: 'SET_FAV_TAGS', payload: tags }),
        setCollections: (cols) => dispatch({ type: 'SET_COLLECTIONS', payload: cols }),
        setCurrentSource: (source) => {
            StopR34Loading();
            updateR34Source(source);
            console.log("APP получил приказ о смене source с ", state.currentSource, " на ", source);
            dispatch({ type: 'SET_CURRENT_SOURCE', payload: source });
        },
        setTypeView: (value) => dispatch({ type: 'SET_TYPE_VIEW', payload: value === null ? getNextViewType(state.typeView) : value }),
        setSortInfo: (newInfo) => dispatch({ type: 'SET_SORT_INFO', payload: { ...state.sortInfo, ...newInfo } }),
        setModalFile: (file) => dispatch({ type: 'SET_MODAL_FILE', payload: file?.uniqueId || null }),
        setSafeMode: (mode) => dispatch({ type: 'SET_SAFE_MODE', payload: mode }),
        updateFile: (file) => dispatch({ type: 'UPDATE_FILE', payload: file }),
    }), [state]);

    useEffect(() => {
        setFavTagsArray = contextValue.setFavTagsArray;
        setCollections = contextValue.setCollections;
        setGallery = contextValue.setMainArray;
        addToGallery = contextValue.addToGallery;
        getGallery = () => state.mainArray;
        getCurrentSource = () => state.currentSource;
        getCollections = () => state.collections;
        setTypeView = contextValue.setTypeView;
        setGallery = contextValue.setMainArray;
        updateGalleryFile = contextValue.updateFile;

        InitDatabaseData();

        GetFavTags().then(tags => {
            if (tags && tags.length > 0) {
                setFavTagsArray(tags);
            }
        });

        import('./Controllers/TagsController').then(module => {
            module.subscribe(() => {
                dispatch({ type: 'INCREMENT_TAGS_VERSION' });
            });
        });
    }, []);

    return (
        <GalleryContext.Provider value={contextValue}>
            <div className={`main-root ${state.safeMode ? "safe-view" : ""}`}>
                <NavBar />
                <Notifications />
                <Modal
                    fileId={state.modalFileId}
                    modalUpdater={contextValue.setModalFile}
                    mainArray={state.mainArray}
                    displayFiles={state.displayArray}
                />

                <div className="wrapper d-flex align-items-stretch main-split overflow-auto">
                    <SideBar currentSource={state.currentSource} favTagsArray={state.favTagsArray} />

                    <div className="container-fluid">
                        <Gallery />
                    </div>

                    <CustomPagination
                        displayArray={state.displayArray}
                        mainArray={state.mainArray}
                        updateDisplayArray={contextValue.setDisplayArray}
                        currentSource={state.currentSource}
                    />
                </div>
            </div>
        </GalleryContext.Provider>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Main />);