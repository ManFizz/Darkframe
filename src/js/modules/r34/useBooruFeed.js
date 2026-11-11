import {useCallback, useEffect, useMemo, useRef} from 'react';
import usePagination from '@hooks/gallery/usePagination';
import useSelection from '@hooks/gallery/useSelection';
import Settings from '@data/settings';
import {useViewPref} from '@services/viewPrefs';
import {matches} from '@services/keymap';
import {useBooruQuery, useSearchStatus} from './booruQuery';
import {blockedBy, setHiddenCount, useBlacklist} from './blacklist';
import {setViewedHiddenCount, useHideViewed, useViewedKeys, viewedKeyOf} from './hideViewed';
import {useLibraryLinks} from './libraryLinks';
import {BOORU_TYPES, CanMoreMedia, LoadMoreMedia} from './R34Controller';

const AUTOFILL = 15;   // pages fetched in a row to fill the shown pages when posts are hidden

/**
 * What the generic gallery shows for a booru source, out of the gallery state:
 * blacklisted and already-viewed posts hidden, pages cut from what's left (and more
 * fetched while they aren't full), the selection, "already in the library" marks.
 *
 *   useBooruFeed({ state, setDisplayArray, setModalFile }) → {
 *     isBooru, booruView, infinite, blacklist, hiding, showHidden,
 *     visibleMain, visibleDisplay, currentPage, maxPage, pages, goToPage, loadNextPage,
 *     inLibrary, selection, hasSelection, openOrSelect }
 */
export default function useBooruFeed({ state, setDisplayArray, setModalFile }) {
    const booruView = useBooruQuery().view;   // 'saved' page has no pagination
    const isBooru = BOORU_TYPES.includes(state.currentSource);
    const [infinite] = useViewPref('booruInfinite');

    // Blacklisted posts are dropped from what the grid and the viewer see (unless
    // "show hidden" is on — then they stay, marked).
    const { list: blacklist, showHidden } = useBlacklist(state.currentSource);
    const hiding = isBooru && blacklist.length > 0;
    // Posts already opened in the viewer, when "hide viewed" is on for this source.
    // While the viewer is open the list stays as it was (see useViewedKeys).
    const { on: hideViewedOn } = useHideViewed(state.currentSource);
    const hidingViewed = isBooru && hideViewedOn;
    const viewed = useViewedKeys(state.mainArray, hidingViewed, state.modalFileId !== null);
    const isViewed = useCallback((f) => viewed.has(viewedKeyOf(f)), [viewed]);
    const keep = useCallback((f) => !(hiding && !showHidden && blockedBy(f, blacklist)) && !(hidingViewed && isViewed(f)),
        [hiding, showHidden, blacklist, hidingViewed, isViewed]);
    const filtering = (hiding && !showHidden) || hidingViewed;
    const visibleMain = useMemo(
        () => (filtering ? state.mainArray.filter(keep) : state.mainArray),
        [state.mainArray, filtering, keep]);
    const visibleDisplay = useMemo(
        () => (filtering ? state.displayArray.filter(keep) : state.displayArray),
        [state.displayArray, filtering, keep]);
    const hiddenCount = useMemo(
        () => (hiding ? state.mainArray.filter(f => blockedBy(f, blacklist)).length : 0),
        [state.mainArray, hiding, blacklist]);
    useEffect(() => setHiddenCount(hiddenCount), [hiddenCount]);
    const viewedHidden = useMemo(
        () => (hidingViewed ? state.mainArray.filter(isViewed).length : 0),
        [state.mainArray, hidingViewed, isViewed]);
    useEffect(() => setViewedHiddenCount(viewedHidden), [viewedHidden]);

    // Pages are cut from what's left after hiding.
    const { currentPage, maxPage, pages, goToPage, loadNextPage } = usePagination({
        mainArray: visibleMain,
        displayArray: state.displayArray,
        currentSource: state.currentSource,
        updateDisplayArray: setDisplayArray,
        modalFile: state.modalFileId,
        resetKey: state.mainArray[0]?.uniqueId,
    });

    // Too few posts left to fill the shown pages: fetch more from the site until they
    // are full (at most AUTOFILL pages per search / per shown page, in case nearly
    // everything is hidden — whether a post is viewed is known only after it loads).
    const searchStatus = useSearchStatus();
    const autoFill = useRef(0);
    const need = maxPage * Settings.MaxThumbsPerPage;
    useEffect(() => { autoFill.current = 0; }, [state.mainArray[0]?.uniqueId, need]);
    useEffect(() => {
        if (!isBooru || !filtering || booruView !== 'search') return;
        if (searchStatus.loading || state.modalFileId !== null || !state.mainArray.length) return;
        if (visibleMain.length >= need) return;
        if (!CanMoreMedia() || autoFill.current >= AUTOFILL) return;
        autoFill.current += 1;
        LoadMoreMedia();
    }, [isBooru, filtering, booruView, searchStatus.loading, state.modalFileId, state.mainArray.length, visibleMain.length, need]);

    const inLibrary = useLibraryLinks();

    // Selection: ctrl / shift click or the checkbox; a plain click opens the viewer.
    const selection = useSelection(visibleDisplay);
    const { clear: clearSelection } = selection;
    useEffect(() => { clearSelection(); }, [state.currentSource, state.mainArray[0]?.uniqueId, clearSelection]);
    const hasSelection = isBooru && selection.selected.size > 0;

    const openOrSelect = useCallback((file, e) => {
        if (isBooru && (e?.ctrlKey || e?.metaKey || e?.shiftKey)) selection.handleSelect(file.uniqueId, e);
        else setModalFile(file);
    }, [isBooru, selection.handleSelect, setModalFile]);

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

    return {
        isBooru, booruView, infinite, blacklist, hiding, showHidden,
        visibleMain, visibleDisplay, currentPage, maxPage, pages, goToPage, loadNextPage,
        inLibrary, selection, hasSelection, openOrSelect,
    };
}
