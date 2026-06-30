import React from 'react';
import Pagination from 'react-bootstrap/Pagination';
import {CanMoreMedia} from "@modules/r34/R34Controller";

// Number of page buttons rendered at once (first/last shortcuts are extra).
const WINDOW_SIZE = 7;

const CustomPagination = ({ anchorPage, lastLoadedPage, totalPages, jumpToPage, appendNextPage }) => {
    if (totalPages <= 1) return null;

    // The gallery shows a contiguous range of pages [anchorPage..lastLoadedPage] at
    // once: clicking a number jumps to a single page, while the "+" button extends
    // the range downwards by appending the next page (that's what lastLoadedPage tracks).

    // Center the visible window on the anchor so it's always rendered; pages of the
    // loaded range that fall past the window are still hinted by the last shortcut.
    const windowEnd = Math.min(totalPages, Math.max(1, anchorPage - Math.floor(WINDOW_SIZE / 2)) + WINDOW_SIZE - 1);
    const windowStart = Math.max(1, windowEnd - WINDOW_SIZE + 1);

    // A page can be appended either from already-loaded pages or, once those run out,
    // by fetching more remote media (R34 family).
    const canAppend = lastLoadedPage < totalPages || CanMoreMedia();

    // Single page button — highlights the anchor and shades the loaded range.
    const renderPage = (page) => (
        <Pagination.Item
            key={page}
            active={page === anchorPage}
            className={page > anchorPage && page <= lastLoadedPage ? 'page-in-range' : ''}
            onClick={() => jumpToPage(page)}
        >
            {page}
        </Pagination.Item>
    );

    const windowPages = [];
    for (let page = windowStart; page <= windowEnd; page++) windowPages.push(renderPage(page));

    return (
        <Pagination size="sm" className="custom-pagination fixed-bottom justify-content-center">
            <Pagination.Prev
                disabled={anchorPage <= 1}
                onClick={() => jumpToPage(anchorPage - 1)}
            />

            {windowStart > 1 && renderPage(1)}
            {windowStart > 2 && <Pagination.Ellipsis disabled />}

            {windowPages}

            {windowEnd < totalPages - 1 && <Pagination.Ellipsis disabled />}
            {windowEnd < totalPages && renderPage(totalPages)}

            <Pagination.Next
                disabled={anchorPage >= totalPages}
                onClick={() => jumpToPage(anchorPage + 1)}
            />

            <Pagination.Item
                className="page-append"
                title="Показать ещё страницу"
                disabled={!canAppend}
                onClick={() => canAppend && appendNextPage()}
            >
                +
            </Pagination.Item>
        </Pagination>
    );
};

export default CustomPagination;
