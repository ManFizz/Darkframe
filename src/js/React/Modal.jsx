import React, {Component} from 'react';
import VideoControls from "./Modal/VideoControls";
import {ActivePostNext, ActivePostPrev, closeModal, InitModal} from "../modal";

class Modal extends Component {

    componentDidMount() {
        let dialog = document.querySelector("dialog");
        dialog.querySelector("#close-modal").onclick = closeModal;
        dialog.querySelector("#post-prev").onclick = ActivePostPrev;
        dialog.querySelector("#post-next").onclick = ActivePostNext;
        document.addEventListener('keydown', this.handleKeyDown);
        InitModal();
    }

    handleKeyDown = (event) => {
        let dialog = document.querySelector("dialog");

        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && dialog.hasAttribute('open')) {
            if (event.key === 'ArrowLeft') {
                ActivePostPrev().then();
            } else {
                ActivePostNext().then();
            }
        }
    }

    render() {
        return <>
            <dialog className="modal">
                <i className="bi bi-chevron-compact-left arrow arrow-left" id="post-prev"/>
                <i
                    className="bi bi-chevron-compact-right arrow arrow-right"
                    id="post-next"
                />
                <i className="bi bi-x-lg btn-cancel" id="close-modal"/>
                <VideoControls/>
                <img alt=""/>
                <video autoPlay={true} loop={true}/>
                <div
                    className="col-md-6 d-flex flex-wrap justify-content-center mx-auto"
                    id="modal-tags"
                />
            </dialog>
        </>;
    };
}

export default Modal;