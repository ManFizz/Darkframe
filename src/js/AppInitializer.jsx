import React, {createContext, useEffect, useMemo, useReducer, useRef, useState} from 'react';
import ReactDOM from 'react-dom/client';

import NavBar from "./React/PageBuilders/NavBar.jsx";
import Modal from "./React/Modal/Modal.jsx";
import SideBar from "./React/PageBuilders/SideBar.jsx";
import Gallery from "./React/PageBuilders/Gallery";
import CustomPagination from "./React/Helpers/CustomPagination";

import {InitDatabaseData} from "./BackendConnect";
import ModuleRegistry from './ModuleRegistry';
import '@/modules';

import LibraryView from "./React/Library/LibraryView";
import ModelsView from './React/Models/ModelsView';
import {SOURCE_TYPES} from "./Constants";

import {bindGallery, galleryReducer, getNextViewType, initialState} from "@controllers/AppInitializerController";
import Notifications from "./React/Helpers/Notifications";
import HotkeysHelp from "./React/Helpers/HotkeysHelp";

import {LibraryContext} from './LibraryContext';
import {useLibraryFilter} from '@hooks/library/useLibraryFilter';
import {initTheme} from '@services/theme';
import {initPwa} from '@services/pwa';
import {installDragScroll} from './Infrastructure/dragScroll';
import LibraryService from '@services/LibraryService';
import ImportActivity from './React/Library/Import/ImportActivity';
import BootOverlay from './React/Helpers/BootOverlay';
import CompareView from './React/Compare/CompareView';
import ErrorBoundary, {installGlobalErrorLog} from './React/ErrorBoundary';
import CommandPalette from './React/Helpers/CommandPalette';
import MangaReader from './React/Manga/MangaReader';
import PageEditor from './React/Manga/PageEditor';
import FolderView from './modules/folder/FolderView';
import MangaView from './modules/manga/MangaView';
import {MangaDownloadsWatcher} from './modules/manga/useMangaDownloads';
import BooruBulkBar from './modules/r34/BooruBulkBar';
import useBooruFeed from './modules/r34/useBooruFeed';
import {CanMoreMedia} from './modules/r34/R34Controller';
import DropToCollection, {startPostDrag} from './React/Library/Collection/DropToCollection';

// Colour mode + accent before the first paint.
initTheme();
initPwa();
// Edge auto-scroll + mouse wheel while dragging anything.
installDragScroll();

export const GalleryContext = createContext(null);

const Main = () => {
    const [state, dispatch] = useReducer(galleryReducer, initialState);

    const [libraryItems, setLibraryItems] = useState([]);
    const libraryFilter = useLibraryFilter(libraryItems);

    const [statsVersion, setStatsVersion] = useState(0);
    const refreshStats = () => setStatsVersion(v => v + 1);

    // Sidebar counters (all / uncategorized / trash) follow changes made anywhere.
    useEffect(() => LibraryService.onLibraryChanged(() => setStatsVersion(v => v + 1)), []);

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
            ModuleRegistry.onSourceChange(source);
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

    // Modules outside React (booru controllers) reach the gallery through this; they
    // read the current state, not the one of the first render.
    const stateRef = useRef(state);
    stateRef.current = state;

    useEffect(() => {
        bindGallery({ dispatch, getState: () => stateRef.current });

        InitDatabaseData();

        import('./Controllers/TagsController').then(module => {
            module.subscribe(() => {
                dispatch({ type: 'INCREMENT_TAGS_VERSION' });
            });
        });
    }, []);

    const isLibrary = state.currentSource === SOURCE_TYPES.LIBRARY;
    const isModels = state.currentSource === SOURCE_TYPES.MODELS;
    const isFolder  = state.currentSource === SOURCE_TYPES.FOLDER;
    const isManga   = state.currentSource === SOURCE_TYPES.MANGA;
    // Library, Folders and Manga are self-contained views (own sidebar, grid and
    // viewer); the booru sources share the generic gallery + pagination below.
    const isGeneric = !isLibrary && !isModels && !isFolder && !isManga;
    // Booru sources: hiding (blacklist, viewed), pages, auto-fill, selection.
    const {
        isBooru, booruView, infinite, blacklist, hiding, showHidden,
        visibleMain, visibleDisplay, currentPage, maxPage, pages, goToPage, loadNextPage,
        inLibrary, selection, hasSelection, openOrSelect,
    } = useBooruFeed({ state, setDisplayArray: contextValue.setDisplayArray, setModalFile: contextValue.setModalFile });

    const viewName = isLibrary ? 'Библиотека' : isModels ? 'Модели' : isFolder ? 'Папки' : isManga ? 'Манга' : 'Галерея';

    return (
        <GalleryContext.Provider value={contextValue}>
            <LibraryContext.Provider value={{
                ...libraryFilter,
                total: libraryItems.length,
                items: libraryItems,   // everything loaded for the current view, before filters
                setLibraryItems,
                statsVersion,
                refreshStats,
            }}>
            <div className={`main-root ${state.safeMode ? "safe-view" : ""}`}>
                <Notifications />
                <HotkeysHelp />
                <ImportActivity />
                <BootOverlay />
                <ErrorBoundary name="Сравнение" compact><CompareView /></ErrorBoundary>
                <DropToCollection />
                <ErrorBoundary name="Командная строка" compact><CommandPalette /></ErrorBoundary>
                <ErrorBoundary name="Читалка" compact><MangaReader /></ErrorBoundary>
                <ErrorBoundary name="Редактор страниц" compact><PageEditor /></ErrorBoundary>
                <MangaDownloadsWatcher />
                <ErrorBoundary name="Верхняя панель" compact><NavBar setLibraryItems={setLibraryItems} /></ErrorBoundary>

                {isGeneric && (
                    <ErrorBoundary name="Просмотр" compact resetKey={state.modalFileId}>
                    <Modal
                        fileId={state.modalFileId}
                        modalUpdater={contextValue.setModalFile}
                        mainArray={visibleMain}
                        displayFiles={visibleDisplay}
                    />
                    </ErrorBoundary>
                )}

                <div className="wrapper d-flex align-items-stretch main-split overflow-auto">
                    {isGeneric && <SideBar currentSource={state.currentSource} />}

                    <div className="container-fluid p-0">
                        <ErrorBoundary name={viewName} resetKey={viewName}>
                        {isLibrary ? (
                            <LibraryView />
                        ) : isModels ? (
                            <ModelsView />
                        ) : isFolder ? (
                            <FolderView />
                        ) : isManga ? (
                            <MangaView />
                        ) : (
                            <Gallery
                                modalFileId={state.modalFileId}
                                modalUpdater={openOrSelect}
                                displayArray={visibleDisplay}
                                typeView={state.typeView}
                                loadNextPage={loadNextPage}
                                infinite={infinite}
                                hasMore={maxPage < pages || CanMoreMedia()}
                                loadedCount={state.mainArray.length}
                                isSelected={isBooru ? selection.isSelected : undefined}
                                onToggleSelect={isBooru ? (f, e) => (e.shiftKey ? selection.range(f.uniqueId) : selection.toggle(f.uniqueId)) : undefined}
                                selectionActive={hasSelection}
                                inLibrary={isBooru ? inLibrary : null}
                                blacklist={hiding && showHidden ? blacklist : null}
                                onDragPost={isBooru ? (f, e) => startPostDrag(e, selection.isSelected(f.uniqueId) ? selection.selectedItems : [f]) : undefined}
                            />
                        )}
                        </ErrorBoundary>
                    </div>

                    {hasSelection && (
                        <BooruBulkBar
                            selectedItems={selection.selectedItems}
                            inLibrary={inLibrary}
                            totalCount={visibleDisplay.length}
                            onSelectAll={selection.selectAll}
                            onClear={selection.clear}
                        />
                    )}

                    {isGeneric && booruView === 'search' && !(isBooru && infinite) && (
                        <CustomPagination
                            anchorPage={currentPage}
                            lastLoadedPage={maxPage}
                            totalPages={pages}
                            jumpToPage={goToPage}
                            appendNextPage={loadNextPage}
                        />
                    )}
                </div>
            </div>
            </LibraryContext.Provider>
        </GalleryContext.Provider>
    );
};

installGlobalErrorLog();
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary name="Darkframe"><Main /></ErrorBoundary>);
