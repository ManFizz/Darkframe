import React, {createContext, useCallback, useEffect, useMemo, useReducer, useState} from 'react';
import ReactDOM from 'react-dom/client';

import NavBar from "./React/PageBuilders/NavBar.jsx";
import Modal from "./React/Modal/Modal.jsx";
import SideBar from "./React/PageBuilders/SideBar.jsx";
import Gallery from "./React/PageBuilders/Gallery";
import CustomPagination from "./React/Helpers/CustomPagination";
import usePagination from "./Hooks/gallery/usePagination";

import {InitDatabaseData} from "./BackendConnect";
import ModuleRegistry from './ModuleRegistry';
import '@/modules';

import LibraryView from "./React/Library/LibraryView";
import ModelsView from './React/Models/ModelsView';
import {SOURCE_TYPES} from "./Constants";

import {AppController, galleryReducer, initialState} from "@controllers/AppInitializerController";
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
import CommandPalette from './React/Helpers/CommandPalette';
import MangaReader from './React/Manga/MangaReader';
import PageEditor from './React/Manga/PageEditor';
import FolderView from './modules/folder/FolderView';
import MangaView from './modules/manga/MangaView';
import {MangaDownloadsWatcher} from './modules/manga/useMangaDownloads';
import {useBooruQuery} from './modules/r34/booruQuery';
import {blockedBy, setHiddenCount, useBlacklist} from './modules/r34/blacklist';
import {useLibraryLinks} from './modules/r34/libraryLinks';
import BooruBulkBar from './modules/r34/BooruBulkBar';
import DropToCollection, {startPostDrag} from './React/Library/Collection/DropToCollection';
import useSelection from './Hooks/gallery/useSelection';
import {BOORU_TYPES, CanMoreMedia} from './modules/r34/R34Controller';
import {useViewPref} from '@services/viewPrefs';
import {matches} from '@services/keymap';

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
        AppController.openModal = contextValue.setModalFile;

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
    const booruView = useBooruQuery().view;   // 'saved' page has no pagination
    const isBooru = BOORU_TYPES.includes(state.currentSource);
    const [infinite] = useViewPref('booruInfinite');

    // Blacklisted posts are dropped from what the grid and the viewer see (unless
    // "show hidden" is on — then they stay, marked).
    const { list: blacklist, showHidden } = useBlacklist(state.currentSource);
    const hiding = isBooru && blacklist.length > 0;
    const visibleMain = useMemo(
        () => (hiding && !showHidden ? state.mainArray.filter(f => !blockedBy(f, blacklist)) : state.mainArray),
        [state.mainArray, hiding, showHidden, blacklist]);
    const visibleDisplay = useMemo(
        () => (hiding && !showHidden ? state.displayArray.filter(f => !blockedBy(f, blacklist)) : state.displayArray),
        [state.displayArray, hiding, showHidden, blacklist]);
    const hiddenCount = useMemo(
        () => (hiding ? state.mainArray.filter(f => blockedBy(f, blacklist)).length : 0),
        [state.mainArray, hiding, blacklist]);
    useEffect(() => setHiddenCount(hiddenCount), [hiddenCount]);

    const inLibrary = useLibraryLinks();

    // Booru selection: ctrl / shift click or the checkbox; a plain click opens the viewer.
    const selection = useSelection(visibleDisplay);
    const { clear: clearSelection } = selection;
    useEffect(() => { clearSelection(); }, [state.currentSource, state.mainArray[0]?.uniqueId, clearSelection]);
    const hasSelection = isBooru && selection.selected.size > 0;

    const openOrSelect = useCallback((file, e) => {
        if (isBooru && (e?.ctrlKey || e?.metaKey || e?.shiftKey)) selection.handleSelect(file.uniqueId, e);
        else contextValue.setModalFile(file);
    }, [isBooru, selection.handleSelect, contextValue]);

    useEffect(() => {
        if (!isBooru) return;
        const onKey = (e) => {
            if (state.modalFileId !== null || e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
            if (e.key === 'Escape' && selection.selected.size) selection.clear();
            if (matches(e, 'common.selectAll')) { e.preventDefault(); selection.selectAll(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isBooru, state.modalFileId, selection]);

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
                <HotkeysHelp />
                <ImportActivity />
                <BootOverlay />
                <CompareView />
                <DropToCollection />
                <CommandPalette />
                <MangaReader />
                <PageEditor />
                <MangaDownloadsWatcher />
                <NavBar setLibraryItems={setLibraryItems} />

                {isGeneric && (
                    <Modal
                        fileId={state.modalFileId}
                        modalUpdater={contextValue.setModalFile}
                        mainArray={visibleMain}
                        displayFiles={visibleDisplay}
                    />
                )}

                <div className="wrapper d-flex align-items-stretch main-split overflow-auto">
                    {isGeneric && <SideBar currentSource={state.currentSource} />}

                    <div className="container-fluid p-0">
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

                    {isGeneric && booruView !== 'saved' && !(isBooru && infinite) && (
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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Main />);
