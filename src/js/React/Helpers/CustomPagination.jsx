import React, {useMemo} from 'react';
import Pagination from 'react-bootstrap/Pagination';
import {CanMoreMedia, LoadMoreMedia} from "@controllers/R34Controller";
import {SOURCE_TYPES} from "@/Constants";

const MAX_PAGES = 7;

const CustomPagination = ({ currentPage, maxPage, pages, goToPage, loadNextPage, currentSource }) => {
    const { paginationItems, startPage, endPage } = useMemo(() => {
        const startPage = Math.max(1, currentPage - Math.floor(MAX_PAGES / 2));
        let endPage = Math.min(pages, startPage + MAX_PAGES - 1);
        const adjustedStart = Math.max(1, endPage - MAX_PAGES + 1);

        const items = [];
        for (let i = adjustedStart; i <= endPage; i++) {
            items.push(
                <Pagination.Item
                    key={i}
                    active={i >= currentPage && i <= maxPage}
                    onClick={() => goToPage(i)}
                >
                    {i}
                </Pagination.Item>
            );
        }

        return { paginationItems: items, startPage: adjustedStart, endPage };
    }, [currentPage, maxPage, pages, goToPage]);

    if (pages <= 1) return null;

    const isR34Family = currentSource === SOURCE_TYPES.R34 || currentSource === SOURCE_TYPES.GELBOORU;

    return (
        <Pagination size="sm" className="fixed-bottom justify-content-center">
            {startPage !== 1 && (
                <Pagination.Item key={1} onClick={() => goToPage(1)}>
                    {1}
                </Pagination.Item>
            )}
            {startPage - 1 > 1 && <Pagination.Ellipsis />}

            {paginationItems}

            {pages - endPage > 1 && <Pagination.Ellipsis />}
            {endPage !== pages && (
                <Pagination.Item key={pages} onClick={() => goToPage(pages)}>
                    {pages}
                </Pagination.Item>
            )}

            <Pagination.Next
                key="next"
                onClick={loadNextPage}
                disabled={pages === maxPage}
            />
            <Pagination.Last
                key="last"
                onClick={() => CanMoreMedia() && LoadMoreMedia()}
                disabled={!isR34Family && !CanMoreMedia()}
            />
        </Pagination>
    );
};

export default CustomPagination;