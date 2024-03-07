import React, {Component} from 'react';
import Pagination from 'react-bootstrap/Pagination';
import Settings from "../../../data/settings";
import {AddMedia, CanMoreMedia} from "../r34";
import {SOURCE_TYPES} from "../Display";

const MAX_PAGES = 7;

export let NotifyCustomPaginationR34 = () => {};

class CustomPagination extends Component {
    constructor(props) {
        super(props);
        this.state = {
            currentPage: 1, //Not 0
            pages: 1,
        };
        this.handleClick = this.handleClick.bind(this);

        this.NotifyCustomPaginationR34 = this.NotifyCustomPaginationR34.bind(this);
        NotifyCustomPaginationR34 = this.NotifyCustomPaginationR34;

        this.handleKeyDown = this.handleKeyDown.bind(this);
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
                Settings.maxThumbsPerPage = Math.min(Settings.maxThumbsPerPage + 8, 160);
                this.props.updateDisplayArray(this.props.mainArray); //rerender
            }
            else if (event.key === 'ArrowDown') {
                Settings.maxThumbsPerPage = Math.max(Settings.maxThumbsPerPage - 8, 16);
                this.props.updateDisplayArray(this.props.mainArray); //rerender
            }
        }
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const { mainArray} = this.props;
        const pages = Math.ceil(mainArray.length / Settings.maxThumbsPerPage);
        if(pages !== this.state.pages) {
            if(this.state.currentPage > pages)
                this.setState({currentPage: 1});

            this.setState({pages: pages});
        }
    }

    handleClick(page) {
        const { mainArray } = this.props;
        this.setState({currentPage: page});

        const startIndex = (page - 1) * Settings.maxThumbsPerPage;
        const endIndex = Math.min(page * Settings.maxThumbsPerPage, mainArray.length);
        this.props.updateDisplayArray(mainArray.slice(startIndex, endIndex));
    }

    NotifyCustomPaginationR34() {
        const { currentSource } = this.props;
        const { pages, currentPage } = this.state;
        const isR34 = (currentSource === SOURCE_TYPES.R34 || currentSource === SOURCE_TYPES.GELBOORU);
        if(isR34 && (pages - currentPage <= 1) && CanMoreMedia()) {
            AddMedia(null);
        }
    }

    render() {
        const { currentPage, pages } = this.state;
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
                    active={i === currentPage}
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
                <Pagination.First
                    key="first"
                    onClick={() => this.handleClick(1)}
                    disabled={currentPage === 1}
                />
                {startPage !== 1 && (<>
                    <Pagination.Item
                        key={1}
                        onClick={() => this.handleClick(1)}
                    >
                        {1}
                    </Pagination.Item>
                </>)}
                {startPage - 1 > 1 && (<Pagination.Ellipsis />)}
                {paginationItems}
                {pages - endPage > 1 && (<Pagination.Ellipsis />)}
                {endPage !== pages && ( <>
                    <Pagination.Item
                        key={pages}
                        onClick={() => this.handleClick(pages)}
                    >
                        {pages}
                    </Pagination.Item>
                </>)}
                <Pagination.Last
                    key="last"
                    onClick={() => this.handleClick(pages)}
                    disabled={currentPage === pages}
                />
            </Pagination>
        );
    }
}

export default CustomPagination;