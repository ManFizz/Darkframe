import React, {Component} from 'react';

class Navigation extends Component {

    constructor(props) {
        super(props);

        this.OpenPrev = this.OpenPrev.bind(this);
        this.OpenNext = this.OpenNext.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    componentDidMount() {
        document.addEventListener('keydown', this.handleKeyDown);
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown(event) {
        if (event.key === 'ArrowLeft') {
            this.OpenPrev();
        } else if (event.key === 'ArrowRight') {
            this.OpenNext();
        }
    }

    OpenPrev() {
        const arr = this.props.displayArray;
        const index = arr.indexOf(this.props.file);
        if(index <= 0)
            return;

        this.props.modalUpdater(arr[index - 1]);
    };

    OpenNext() {
        const arr = this.props.displayArray;
        const index = arr.indexOf(this.props.file);
        if(index >= arr.length - 1)
            return;

        this.props.modalUpdater(arr[index + 1]);
    };

    render() {
        return <>
                <i
                    className="bi bi-chevron-compact-left arrow arrow-left"
                    id="post-prev"
                    onClick={this.OpenPrev}
                />
                <i
                    className="bi bi-chevron-compact-right arrow arrow-right"
                    id="post-next"
                    onClick={this.OpenNext}
                />
                <i
                    className="bi bi-x-lg btn-cancel"
                    id="close-modal"
                    onClick={() => this.props.modalUpdater(null)}
                />
        </>;
    };
}

export default Navigation;