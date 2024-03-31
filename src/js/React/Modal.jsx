import React, {Component} from 'react';
import Navigation from "./Modal/Navigation";
import {FILE_TYPES} from "../Display";
import Tags from "./Modal/Tags";
import Video from "./Modal/Video";

class Modal extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isLong: false,
            degree: 0,
        };
        this.modal = React.createRef();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const { file, mainArray } = this.props;
        if(file !== null) {
            if(prevProps.file === null) {
                this.modal.current.focus();
                return;
            }

            if(prevProps.file !== file) {
                this.setState({isLong: false});
                this.modal.current.scrollTo(0,0);

                file.getSize().then((size) => {
                    if(size === null)
                        return;

                    if(size.height / size.width > 2.0)
                        this.setState({isLong: true});
                })
                if(file.type === FILE_TYPES.IMAGE) {
                    const index = mainArray.indexOf(file) + 1;
                    if(index < mainArray.length) {
                        const nextMedia = new Image();
                        nextMedia.src = mainArray[index].thumbUrl;
                    }
                }
            }
        }

    }

    render() {
        const { file, tagsData } = this.props;
        if(!file) return <></>;
        return <>
            <dialog className={`modal ${file._fav ? "favorite" : ""}`} open ref={this.modal}>
                <Navigation
                    file={file}
                    modalUpdater={this.props.modalUpdater}
                    mainArray={this.props.mainArray}
                    setProps={(data) => this.setState(data)}
                />
                {file.type === FILE_TYPES.IMAGE ? (
                    <img
                        key={file.thumbUrl}
                        alt={file.title}
                        src={file.thumbUrl}
                        className={this.state.isLong ? "long" : ""}
                        style={{transform: `rotate(${this.state.degree}deg)`}}
                    />
                ) : (
                    <Video file={file} />
                )}
                <Tags file={file} tagsData={tagsData}/>
            </dialog>
        </>;
    };
}

export default Modal;