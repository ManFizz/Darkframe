import React, {Component} from 'react';
import Pagination from 'react-bootstrap/Pagination';
import Settings from "../../../../data/settings";
import {CanMoreMedia, LoadMoreMedia} from "../../Controllers/R34Controller";
import {setGallery} from "../../Controllers/AppInitializerController";
import {SOURCE_TYPES} from "../../Constants";

const MAX_PAGES = 7;

export let NotifyCustomPaginationR34 = () => {};

export let LoadNextPage = () => {};

class CustomPagination extends Component {
    constructor(props) {
        super(props);
        this.state = {
            currentPage: 1, //Not 0
            maxPage: 1,
            pages: 1,
        };
        this.handleClick = this.handleClick.bind(this);

        this.NotifyCustomPaginationR34 = this.NotifyCustomPaginationR34.bind(this);
        NotifyCustomPaginationR34 = this.NotifyCustomPaginationR34;

        this.handleKeyDown = this.handleKeyDown.bind(this);
        LoadNextPage = this.LoadNextPage.bind(this);
    }

    LoadNextPage() {
        const { maxPage, currentPage, pages } = this.state;
        let newPage = maxPage + 1;
        if(newPage <= pages) {
            const { mainArray } = this.props;

            const startIndex = (currentPage - 1) * Settings.MaxThumbsPerPage;
            const endIndex = Math.min(newPage * Settings.MaxThumbsPerPage, mainArray.length);
            this.props.updateDisplayArray(mainArray.slice(startIndex, endIndex));

            this.setState({maxPage: newPage}, NotifyCustomPaginationR34);
        }
    }

    componentDidMount() {
        document.addEventListener('keydown', this.handleKeyDown);
    }
    componentWillUnmount() {
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown(event) {
        const { pages, currentPage } = this.state;
        if(event.ctrlKey && this.props.modalFile === null) {
            if (event.key === 'ArrowLeft') {
                if(currentPage > 1)
                    this.handleClick(currentPage-1);
            }
            else if (event.key === 'ArrowRight') {
                if(currentPage < pages)
                    this.handleClick(currentPage+1);
            }
            else if (event.key === 'ArrowUp') {
                Settings.MaxThumbsPerPage = Math.min(Settings.MaxThumbsPerPage + 8, 160);
                setGallery(this.props.mainArray); //rerender
            }
            else if (event.key === 'ArrowDown') {
                Settings.MaxThumbsPerPage = Math.max(Settings.MaxThumbsPerPage - 8, 16);
                setGallery(this.props.mainArray); //rerender
            }
        }
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const { mainArray} = this.props;
        if(mainArray.length !== prevProps.mainArray.length){
            const pages = Math.ceil(mainArray.length / Settings.MaxThumbsPerPage);
            if(pages !== this.state.pages) {
                if(mainArray.length === 0 || prevProps.mainArray[0] == null || prevProps.mainArray[0].uniqueId.localeCompare(mainArray[0]?.uniqueId) !== 0)
                    this.setState({currentPage: 1, maxPage: 1});

                this.setState({pages: pages});
            }
        }
    }

    handleClick(page) {
        const { mainArray } = this.props;

        const startIndex = (page - 1) * Settings.MaxThumbsPerPage;
        const endIndex = Math.min(page * Settings.MaxThumbsPerPage, mainArray.length);
        this.props.updateDisplayArray(mainArray.slice(startIndex, endIndex));

        this.setState({currentPage: page, maxPage: page}, NotifyCustomPaginationR34);
    }

    NotifyCustomPaginationR34() {
        const { currentSource } = this.props;
        const { pages, maxPage } = this.state;
        const isR34 = (currentSource === SOURCE_TYPES.R34 || currentSource === SOURCE_TYPES.GELBOORU);
        if(isR34 && (pages - maxPage <= 1) && CanMoreMedia()) {
            LoadMoreMedia();
        }
    }

    render() {
        const { currentPage, pages, maxPage } = this.state;
        const { currentSource } = this.props;
        if (pages <= 1) return null;

        const paginationItems = [];
        let startPage = Math.max(1, currentPage - Math.floor(MAX_PAGES / 2));
        let endPage = Math.min(pages, startPage + MAX_PAGES - 1);

        if (endPage - startPage + 1 < MAX_PAGES) {
            startPage = Math.max(1, endPage - MAX_PAGES + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationItems.push(
                <Pagination.Item
                    key={i}
                    active={i >= currentPage && i <= maxPage}
                    onClick={() => this.handleClick(i)}
                >
                    {i}
                </Pagination.Item>
            );
        }

        return (
            <Pagination
                size="sm"
                className="fixed-bottom justify-content-center"
            >
                {startPage !== 1 && (
                    <Pagination.Item key={1} onClick={() => this.handleClick(1)}>
                        {1}
                    </Pagination.Item>
                )}
                {startPage - 1 > 1 && (<Pagination.Ellipsis />)}
                {paginationItems}
                {pages - endPage > 1 && (<Pagination.Ellipsis />)}
                {endPage !== pages && ( <>
                    <Pagination.Item key={pages} onClick={() => this.handleClick(pages)} >
                        {pages}
                    </Pagination.Item>
                </>)}
                <Pagination.Next key="next" onClick={LoadNextPage} disabled={pages === maxPage} />
                <Pagination.Last
                    key="last"
                    onClick={() => CanMoreMedia() && LoadMoreMedia()}
                    disabled={currentSource !== SOURCE_TYPES.R34 && currentSource !== SOURCE_TYPES.GELBOORU && !CanMoreMedia()}
                />
            </Pagination>
        );
    }
}

export default CustomPagination;