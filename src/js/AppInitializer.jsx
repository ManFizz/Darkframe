import React, {createContext, useEffect, useMemo, useReducer} from 'react';
import ReactDOM from 'react-dom/client';

import NavBar from "./React/PageBuilders/NavBar.jsx";
import Modal from "./React/Modal/Modal.jsx";
import SideBar from "./React/PageBuilders/SideBar.jsx";
import Gallery from "./React/PageBuilders/Gallery";
import CustomPagination from "./React/Helpers/CustomPagination";
import Notifications from "./React/Helpers/Notifications";

import {GetFavTags, InitDatabaseData} from "./BackendConnect";
import {updateR34Source} from "./Controllers/R34Controller";
import {StopR34Loading} from "./Controllers/R34FavoriteController"

import {AppController, galleryReducer, initialState} from "./Controllers/AppInitializerController";

export const GalleryContext = createContext(null);

const Main = () => {
    const [state, dispatch] = useReducer(galleryReducer, initialState);

    const contextValue = useMemo(() => ({
        state,
        dispatch,

        setMainArray: (arr) =>
            dispatch({ type: 'SET_MAIN_ARRAY', payload: arr }),

        addToGallery: (items) =>
            dispatch({ type: 'ADD_TO_GALLERY', payload: items }),

        setDisplayArray: (arr) =>
            dispatch({ type: 'SET_DISPLAY_ARRAY', payload: arr }),

        setFavTagsArray: (tags) =>
            dispatch({ type: 'SET_FAV_TAGS', payload: tags }),

        setCollections: (cols) =>
            dispatch({ type: 'SET_COLLECTIONS', payload: cols }),

        setCurrentSource: (source) => {
            StopR34Loading();
            updateR34Source(source);
            dispatch({ type: 'SET_CURRENT_SOURCE', payload: source });
        },

        setTypeView: (value) =>
            dispatch({
                type: 'SET_TYPE_VIEW',
                payload: value === null ? getNextViewType(state.typeView) : value
            }),

        setSortInfo: (newInfo) =>
            dispatch({
                type: 'SET_SORT_INFO',
                payload: { ...state.sortInfo, ...newInfo }
            }),

        setModalFile: (file) =>
            dispatch({
                type: 'SET_MODAL_FILE',
                payload: file?.uniqueId || null
            }),

        setSafeMode: (mode) =>
            dispatch({ type: 'SET_SAFE_MODE', payload: mode }),

        updateFile: (file) =>
            dispatch({ type: 'UPDATE_FILE', payload: file }),
    }), [
        state.mainArray,
        state.displayArray,
        state.currentSource,
        state.typeView,
        state.sortInfo,
        state.safeMode,
        state.collections
    ]);

    useEffect(() => {
        AppController.setFavTagsArray = contextValue.setFavTagsArray;
        AppController.setCollections = contextValue.setCollections;
        AppController.setGallery = contextValue.setMainArray;
        AppController.addToGallery = contextValue.addToGallery;

        AppController.getGallery = () => state.mainArray;
        AppController.getCurrentSource = () => state.currentSource;
        AppController.getCollections = () => state.collections;

        AppController.setTypeView = contextValue.setTypeView;
        AppController.updateGalleryFile = contextValue.updateFile;

        InitDatabaseData();

        GetFavTags().then(tags => {
            if (tags?.length) {
                AppController.setFavTagsArray(tags);
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
                    <SideBar
                        currentSource={state.currentSource}
                        favTagsArray={state.favTagsArray}
                    />

                    <div className="container-fluid">
                        <Gallery
                            modalFileId={state.modalFileId}
                            modalUpdater={contextValue.setModalFile}
                            displayArray={state.displayArray}
                            typeView={state.typeView}
                        />
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