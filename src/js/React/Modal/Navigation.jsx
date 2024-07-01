import React, { Component } from 'react';
import { FILE_TYPES, SOURCE_TYPES } from "../../Display";
import { LoadNextPage } from "../CustomPagination";
import { AddMedia, CanMoreMedia } from "../../r34";

class Navigation extends Component {
    constructor(props) {
        super(props);
        this.state = {
            currentIndex: 0,
            isFav: false,
            nextPageBlockTimer: null,
        }
    }

    componentDidMount() {
        if(this.props.file.isFav())
            this.setState({isFav: true});
        this.updateIndex();
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('mousedown', this.handleMousePressButtons);
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('mousedown', this.handleMousePressButtons);
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const { file, modalFile } = this.props;
        if(prevProps.file !== file) {
            this.updateIndex();
            if(file.isFav() !== this.state.isFav)
                this.setState({isFav: file.isFav()});
        }
    }

    updateIndex = () => {
        const index = this.props.mainArray.indexOf(this.props.file);
        if(index !== this.state.currentIndex) {
            this.setState({currentIndex: index});
            if(this.props.file.thumbUrl.localeCompare(this.props.displayFiles[0].thumbUrl) === 0)
                LoadNextPage();
        }
    }

    handleKeyDown = (event) => {
        if(!event.ctrlKey) {
            if (event.key === 'ArrowLeft') {
                this.OpenShift(-1);
            } else if (event.key === 'ArrowRight') {
                this.OpenShift(1);
            } else if(event.key === 'Enter'){
                this.clickFavHandler();
            }
        }
        if(event.key === 'Escape') {
            this.props.modalUpdater(null);
        }
    }

    handleMousePressButtons = (ev) => {
        if((ev.buttons & 8) !== 0) {
            this.OpenShift(-1);
        }
        else if ((ev.buttons & 16) !== 0) {
            this.OpenShift(1);
        }
    }

    CanShift = (index) => {
        if(index < 0 || index >= this.props.mainArray.length)
            return null;

        const newFile = this.props.mainArray[index];
        if(newFile.type === FILE_TYPES.IMAGE || newFile.type === FILE_TYPES.VIDEO) {
            return newFile;
        }

        return null;
    }

    OpenShift = (value) => {
        const newFile = this.CanShift(this.state.currentIndex + value);
        if(newFile !== null) {
            this.props.modalUpdater(newFile);
        } else if(value > 0) {
            const { currentSource } = this.props;
            const isR34 = (currentSource === SOURCE_TYPES.R34 || currentSource === SOURCE_TYPES.GELBOORU);
            if(isR34 && CanMoreMedia() && this.state.nextPageBlockTimer === null) {
                const timer = setTimeout(() => {
                    this.setState({ nextPageBlockTimer: null })
                }, 5000);
                this.setState({ nextPageBlockTimer: timer });
                AddMedia(null);
            }
        }
    };

    clickFavHandler = () => {
        const isFav = this.props.file.isFav();
        this.props.file.ToggleFav();
        this.setState({isFav: !isFav});
    }

    handleRotateClick = (e) => {
        e.stopPropagation();

        this.props.setProps(prevProps => ({
            degree: (prevProps.degree + 90) % 360,
        }));
    }

    render() {
        const { modalUpdater, file } = this.props;
        const { currentIndex } = this.state;
        return <>
            {(file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO) && (
              this.state.isFav ? (
                <i className="bi bi-ban" onClick={this.clickFavHandler}></i>
              ) : (
                <i className="bi bi-heart-fill" onClick={this.clickFavHandler}></i>
              )
            )}
            <i className="bi bi-arrow-clockwise" onClick={this.handleRotateClick} />
            <i
              style={{display: this.CanShift(currentIndex - 1) === null ? 'none' : 'block'}}
              className="bi bi-chevron-compact-left arrow arrow-left"
              id="post-prev"
              onClick={() => this.OpenShift(-1)}
            />
            <i
              style={{display: this.CanShift(currentIndex + 1) === null ? 'none' : 'block'}}
              className="bi bi-chevron-compact-right arrow arrow-right"
              id="post-next"
              onClick={() => this.OpenShift(1)}
            />
            <i
              className="bi bi-x-lg btn-cancel"
              id="close-modal"
              onClick={() => modalUpdater(null)}
            />
        </>;
    };
}

export default Navigation;