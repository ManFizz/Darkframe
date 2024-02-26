import React, {Component} from 'react';
import Pagination from 'react-bootstrap/Pagination';
import Settings from "../../../data/settings";
import {currentSection} from "../main";
import {AddMedia} from "../r34";

const MAX_PAGES = 7;

class CustomPagination extends Component {
    constructor(props) {
        super(props);
        this.state = {
            currentPage: 1, //Not 0
            pages: 1,
        };
        this.handleClick = this.handleClick.bind(this);
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

        if((endIndex + Settings.maxThumbsPerPage) >= mainArray.length  && currentSection === "section-r34") {
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