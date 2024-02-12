import React, {Component} from 'react';
import {skipAhead, skipSec, skipToSec, toggleMuted, togglePlay, toggleRepeat, updateSeekTooltip} from "../../modal";
import {createPopper} from "@popperjs/core";

class VideoControls extends Component {
    static lastStateVideo = false;

    componentDidMount() {
        let dialog = document.querySelector("dialog");
        dialog.querySelector("#toggle-repeat-1").onclick = toggleRepeat;
        dialog.querySelector("#toggle-repeat").onclick = toggleRepeat;
        dialog.querySelector("#btn-mute").onclick = toggleMuted;
        dialog.querySelector("#btn-volume").onclick = toggleMuted;
        let videoControl = dialog.querySelector(".time-control");
        videoControl.querySelector(".bi-skip-start-fill").onclick = () => skipToSec(0);
        videoControl.querySelector(".bi-rewind-fill").onclick = () => skipSec(-10);
        videoControl.querySelector(".btn-pause").onclick = togglePlay;
        videoControl.querySelector(".btn-play").onclick = togglePlay;
        videoControl.querySelector(".bi-fast-forward-fill").onclick = () => skipSec(10);
        videoControl.querySelector(".bi-skip-end-fill").onclick = () => skipToSec(-1);

        let seek = document.getElementById('seek');
        seek.addEventListener('input', skipAhead);

        seek.addEventListener('mousemove', updateSeekTooltip);
        seek.addEventListener('mousedown', () => {
            let vid = dialog.querySelector('video');
            this.lastStateVideo = vid.paused;
            vid.pause();
        });
        seek.addEventListener('mouseup', () => {
            let vid = dialog.querySelector('video');
            if(vid.paused && !this.lastStateVideo)
                vid.play().then();
        });
    }

    render() {
        return <>
            <div className="video-controls">
                <div className="video-misc">
                    <i className="bi bi-repeat-1 btn-repeat-1" id="toggle-repeat-1"/>
                    <i className="bi bi-repeat  btn-repeat hidden" id="toggle-repeat"/>
                    <i className="bi bi-volume-mute-fill btn-mute hidden" id="btn-mute"/>
                    <i className="bi bi-volume-up-fill btn-volume" id="btn-volume"/>
                </div>
                <div className="time-control">
                    <time id="time-elapsed">00:00</time>
                    <i className="bi bi-skip-start-fill"/>
                    <i className="bi bi-rewind-fill"/>
                    <i className="bi bi-pause-fill btn-pause"/>
                    <i className="bi bi-play-fill btn-play hidden"/>
                    <i className="bi bi-fast-forward-fill"/>
                    <i className="bi bi-skip-end-fill"/>
                    <time id="duration">00:00</time>
                </div>
                <div className="video-progress">
                    <progress id="progress-bar" value={0}/>
                    <input
                        className="seek"
                        id="seek"
                        defaultValue={0}
                        min={0}
                        type="range"
                        step={1}
                    />
                    <div className="seek-tooltip" id="seek-tooltip">
                        <div id="arrow" data-popper-arrow="true">
                            .
                        </div>
                    </div>
                </div>
            </div>
        </>;
    }
}

export default VideoControls;