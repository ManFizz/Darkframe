import React, {Component} from 'react';
import {
    BsFastForwardFill,
    BsFillPauseFill, BsFillPlayFill,
    BsFillRewindFill, BsFillSkipEndFill,
    BsFillSkipStartFill,
    BsFillVolumeMuteFill,
    BsFillVolumeUpFill,
    BsRepeat,
    BsRepeat1
} from "react-icons/bs";

class VideoControls extends Component {
    constructor(props) {
        super(props);

        this.toggleMute = this.toggleMute.bind(this);
        this.togglePlay = this.togglePlay.bind(this);
        this.skipAhead = this.skipAhead.bind(this);
        this.skipToSec = this.skipToSec.bind(this);
        this.skipSec = this.skipSec.bind(this);
        this.handleSeekMouseUp = this.handleSeekMouseUp.bind(this);
        this.handleSeekMouseDown = this.handleSeekMouseDown.bind(this);

        this.lastStateVideo = false;
    }

    toggleMute() {
        const { video } = this.props;
        video.muted = !video.muted;
    }

    togglePlay() {
        const { video } = this.props;
        const isPaused = (video.paused || video.ended);
        if(isPaused)
            video.play().then();
        else
            video.pause();
    }

    skipAhead(event) {
        const { video } = this.props;
        const newValue = event.target.dataset.seek ? event.target.dataset.seek : event.target.value;
        if(newValue !== Math.round(video.currentTime))
            video.currentTime = newValue;
    }

    skipToSec(skipTo) {
        const { video } = this.props;
        video.currentTime = Math.max(0, Math.min(skipTo, video.duration));
    }

    skipSec(seconds) {
        const { video } = this.props;
        video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration));
    }

    formatTime(timeInSeconds) {
        const date = new Date(timeInSeconds * 1000);
        const time = {
            minutes: date.getMinutes(),
            seconds: date.getSeconds() < 10 ? "0" + date.getSeconds() : date.getSeconds(),
        };
        return `${time.minutes}:${time.seconds}`;
    }

    handleSeekMouseUp() {
        const { video } = this.props;
        if(video.paused && !this.lastStateVideo)
            video.play().then();
    }

    handleSeekMouseDown() {
        const { video } = this.props;
        this.lastStateVideo = video.paused;
        video.pause();
    }


    render() {
        const { isLooped, isMuted, isPaused, currentTime, videoDuration, toggleLoop } = this.props;
        return <>
            <div className="video-controls">
                <div className="video-misc">
                    <BsRepeat1 onClick={toggleLoop} style={{ display: isLooped ? 'block' : 'none' }}/>
                    <BsRepeat onClick={toggleLoop} style={{ display: !isLooped ? 'block' : 'none' }}/>
                    <BsFillVolumeMuteFill onClick={this.toggleMute} style={{ display: isMuted ? 'block' : 'none' }}/>
                    <BsFillVolumeUpFill onClick={this.toggleMute} style={{ display: !isMuted ? 'block' : 'none' }}/>
                </div>
                <div className="time-control">
                    <time id="time-elapsed">{this.formatTime(currentTime)}</time>
                    <BsFillSkipStartFill onClick={() => this.skipToSec(0)}/>
                    <BsFillRewindFill onClick={() => this.skipSec(-10)}/>
                    <BsFillPauseFill onClick={this.togglePlay} style={{ display: !isPaused ? 'block' : 'none' }}/>
                    <BsFillPlayFill onClick={this.togglePlay} style={{ display: isPaused ? 'block' : 'none' }}/>
                    <BsFastForwardFill onClick={() => this.skipSec(10)}/>
                    <BsFillSkipEndFill onClick={() => this.skipToSec(Number.MAX_VALUE)}/>
                    <time id="duration">{this.formatTime(videoDuration)}</time>
                </div>
                <div className="video-progress">
                    <progress
                        value={currentTime}
                        max={videoDuration}
                    />
                    <input
                        className="seek"
                        id="seek"
                        min={0}
                        type="range"
                        step={0.25}
                        onChange={this.skipAhead}
                        value={currentTime}
                        max={videoDuration}
                        onMouseUp={this.handleSeekMouseUp}
                        onMouseDown={this.handleSeekMouseDown}
                    />
                    <div
                        className="seek-tooltip"
                    >
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