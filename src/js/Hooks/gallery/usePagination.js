import {useCallback, useEffect, useRef, useState} from "react";
import Settings from "@data/settings";
import {BOORU_TYPES, CanMoreMedia, LoadMoreMedia} from "@modules/r34/R34Controller";

// `mainArray` is what the pages are cut from — for the booru sources, the results
// minus the hidden posts, so a page is full however many of them are hidden.
export function usePagination({ mainArray, displayArray, currentSource, updateDisplayArray, modalFile, resetKey = mainArray[0]?.uniqueId }) {
    const [currentPage, setCurrentPage] = useState(1);
    const [maxPage, setMaxPage] = useState(1);
    const [perPage, setPerPage] = useState(Settings.MaxThumbsPerPage);

    const pages = Math.ceil(mainArray.length / Settings.MaxThumbsPerPage);

    const goToPage = useCallback((page) => {
        const start = (page - 1) * Settings.MaxThumbsPerPage;
        const end = Math.min(page * Settings.MaxThumbsPerPage, mainArray.length);
        updateDisplayArray(mainArray.slice(start, end));
        setCurrentPage(page);
        setMaxPage(page);
        if(pages - page <= 1)
            tryLoadR34MoreMedia();

    }, [mainArray, currentSource, pages, updateDisplayArray]);

    const tryLoadR34MoreMedia = () => {
        const isR34 = BOORU_TYPES.includes(currentSource);
        if (isR34 &&  CanMoreMedia()) LoadMoreMedia();
    }

    const loadNextPage = useCallback(() => {
        const newMax = maxPage + 1;
        if(newMax >= pages)
            tryLoadR34MoreMedia();
        if (newMax > pages)
            return;

        const start = (currentPage - 1) * Settings.MaxThumbsPerPage;
        const end = Math.min(newMax * Settings.MaxThumbsPerPage, mainArray.length);
        updateDisplayArray(mainArray.slice(start, end));
        setMaxPage(newMax);
    }, [maxPage, pages, currentPage, mainArray, updateDisplayArray]);

    useEffect(() => {
        const handleKey = (e) => {
            if (!e.ctrlKey || modalFile !== null) return;

            if (e.key === 'ArrowLeft' && currentPage > 1) goToPage(currentPage - 1);
            if (e.key === 'ArrowRight' && currentPage < pages) goToPage(currentPage + 1);
            if (e.key === 'ArrowUp') {
                Settings.MaxThumbsPerPage = Math.min(Settings.MaxThumbsPerPage + 8, 160);
                setPerPage(Settings.MaxThumbsPerPage);
            }
            if (e.key === 'ArrowDown') {
                Settings.MaxThumbsPerPage = Math.max(Settings.MaxThumbsPerPage - 8, 16);
                setPerPage(Settings.MaxThumbsPerPage);
            }
        };

        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [currentPage, pages, modalFile, mainArray, goToPage]);

    useEffect(() => {
        if (mainArray.length === 0) {
            setCurrentPage(1);
            setMaxPage(1);
        }
    }, [mainArray]);

    // A new list (a new search, another sort) starts at page 1. `resetKey` tells one
    // apart: hiding the first post isn't a new list.
    useEffect(() => {
        setCurrentPage(1);
        setMaxPage(1);
    }, [resetKey]);
    const lastKey = useRef(resetKey);

    // The shown pages follow the list: posts that got hidden leave a gap the next ones
    // fill, more results top up a short last page, page size changes apply.
    useEffect(() => {
        if (!displayArray) return;
        // A new list: the pages are about to go back to 1 — cut that, not the old ones.
        const fresh = lastKey.current !== resetKey;
        lastKey.current = resetKey;
        const from = fresh ? 1 : currentPage, to = fresh ? 1 : maxPage;
        const next = mainArray.slice((from - 1) * perPage, to * perPage);
        const same = next.length === displayArray.length && next.every((f, i) => f.uniqueId === displayArray[i]?.uniqueId);
        if (!same) updateDisplayArray(next);
    }, [mainArray, currentPage, maxPage, perPage, resetKey]);   // eslint-disable-line react-hooks/exhaustive-deps

    return { currentPage, maxPage, pages, goToPage, loadNextPage };
}

export default usePagination;
