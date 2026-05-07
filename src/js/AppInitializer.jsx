import React, {createContext, useEffect, useMemo, useReducer, useState} from 'react';
import ReactDOM from 'react-dom/client';

import NavBar from "./React/PageBuilders/NavBar.jsx";
import Modal from "./React/Modal/Modal.jsx";
import SideBar from "./React/PageBuilders/SideBar.jsx";
import Gallery from "./React/PageBuilders/Gallery";
import CustomPagination from "./React/Helpers/CustomPagination";
import usePagination from "./Hooks/usePagination";

import {InitDatabaseData} from "./BackendConnect";
import {updateR34Source} from "@controllers/R34Controller";
import {StopR34Loading} from "@controllers/R34FavoriteController"

import LibraryView from "./React/Library/LibraryView";
import {SOURCE_TYPES} from "./Constants";

import {AppController, galleryReducer, initialState} from "@controllers/AppInitializerController";
import Notifications from "./React/Helpers/Notifications";

import {LibraryContext} from './LibraryContext';
import {useLibraryFilter} from '@hooks/useLibraryFilter';

export const GalleryContext = createContext(null);

const Main = () => {
    const [state, dispatch] = useReducer(galleryReducer, initialState);

    const [libraryItems, setLibraryItems] = useState([]);
    const libraryFilter = useLibraryFilter(libraryItems);

    const [statsVersion, setStatsVersion] = useState(0);
    const refreshStats = () => setStatsVersion(v => v + 1);

    const contextValue = useMemo(() => ({
        state,
        dispatch,

        setMainArray: (arr) =>
            dispatch({ type: 'SET_MAIN_ARRAY', payload: arr }),

        addToGallery: (items) =>
            dispatch({ type: 'ADD_TO_GALLERY', payload: items }),

        setDisplayArray: (arr) =>
            dispatch({ type: 'SET_DISPLAY_ARRAY', payload: arr }),

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
    ]);

    const { currentPage, maxPage, pages, goToPage, loadNextPage } = usePagination({
        mainArray: state.mainArray,
        currentSource: state.currentSource,
        updateDisplayArray: contextValue.setDisplayArray,
        modalFile: state.modalFileId,
    });

    useEffect(() => {
        AppController.setGallery = contextValue.setMainArray;
        AppController.addToGallery = contextValue.addToGallery;

        AppController.getGallery = () => state.mainArray;
        AppController.getCurrentSource = () => state.currentSource;

        AppController.setTypeView = contextValue.setTypeView;
        AppController.updateGalleryFile = contextValue.updateFile;

        InitDatabaseData();

        import('./Controllers/TagsController').then(module => {
            module.subscribe(() => {
                dispatch({ type: 'INCREMENT_TAGS_VERSION' });
            });
        });
    }, []);

    const isLibrary = state.currentSource === SOURCE_TYPES.LIBRARY;

    return (
        <GalleryContext.Provider value={contextValue}>
            <LibraryContext.Provider value={{
                ...libraryFilter,
                total: libraryItems.length,
                setLibraryItems,
                statsVersion,
                refreshStats,
            }}>
            <div className={`main-root ${state.safeMode ? "safe-view" : ""}`}>
                <Notifications />
                <NavBar setLibraryItems={setLibraryItems} />

                {!isLibrary && (
                    <Modal
                        fileId={state.modalFileId}
                        modalUpdater={contextValue.setModalFile}
                        mainArray={state.mainArray}
                        displayFiles={state.displayArray}
                    />
                )}

                <div className="wrapper d-flex align-items-stretch main-split overflow-auto">
                    {!isLibrary && <SideBar currentSource={state.currentSource} />}

                    <div className="container-fluid p-0">
                        {isLibrary ? (
                            <LibraryView />
                        ) : (
                            <Gallery
                                modalFileId={state.modalFileId}
                                modalUpdater={contextValue.setModalFile}
                                displayArray={state.displayArray}
                                typeView={state.typeView}
                                loadNextPage={loadNextPage}
                            />
                        )}
                    </div>

                    {!isLibrary && (
                        <CustomPagination
                            currentPage={currentPage}
                            maxPage={maxPage}
                            pages={pages}
                            goToPage={goToPage}
                            loadNextPage={loadNextPage}
                            currentSource={state.currentSource}
                        />
                    )}
                </div>
            </div>
            </LibraryContext.Provider>
        </GalleryContext.Provider>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Main />);