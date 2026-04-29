import {useCallback, useEffect, useState} from "react";
import {SOURCE_TYPES} from "../Constants";
import Settings from "../../../data/settings";
import {setGallery} from "../Controllers/AppInitializerController";
import {CanMoreMedia, LoadMoreMedia} from "../Controllers/R34Controller";

export function usePagination({ mainArray, currentSource, updateDisplayArray, modalFile }) {
    const [currentPage, setCurrentPage] = useState(1);
    const [maxPage, setMaxPage] = useState(1);

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
        const isR34 = currentSource === SOURCE_TYPES.R34 || currentSource === SOURCE_TYPES.GELBOORU;
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
                setGallery(mainArray);
            }
            if (e.key === 'ArrowDown') {
                Settings.MaxThumbsPerPage = Math.max(Settings.MaxThumbsPerPage - 8, 16);
                setGallery(mainArray);
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

    useEffect(() => {
        setCurrentPage(1);
        setMaxPage(1);
    }, [mainArray[0]?.uniqueId]);

    return { currentPage, maxPage, pages, goToPage, loadNextPage };
}

export default usePagination;