import React, {Component} from 'react';
import VideoControls from "./VideoControls";

class Video extends Component {
    constructor(props) {
        super(props);
        this.state = {
            video: null,
            isLooped: true,
            isMuted: false,
            isPaused: true,
            currentTime: 0,
            videoDuration: 0,
            isMounted: false,
            lastStateVideo: false,
            popperInstance: null,
        }

        this.videoRef = React.createRef();

        this.handleVolumeChange = this.handleVolumeChange.bind(this);
        this.handlePause = this.handlePause.bind(this);
        this.handleEnded = this.handleEnded.bind(this);
        this.handlePlay = this.handlePlay.bind(this);
        this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
        this.handleDurationChange = this.handleDurationChange.bind(this);
        this.toggleLoop = this.toggleLoop.bind(this);
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const { video } = this.state;
        if(video !== this.videoRef.current)
            this.setState({video: this.videoRef.current});
    }

    handleVolumeChange() {
        const video = this.videoRef.current;
        if (this.state.isMuted !== video.muted)
            this.setState({isMuted: video.muted});
    };

    handlePause() {
        if (this.state.isPaused !== true)
            this.setState({ isPaused: true });
    };

    handleEnded() {
        if (this.state.isPaused !== true)
            this.setState({ isPaused: true });
    };

    handlePlay() {
        if (this.state.isPaused !== false)
            this.setState({ isPaused: false });
    };

    handleTimeUpdate() {
        const video = this.videoRef.current;
        if (this.state.currentTime !== video.currentTime)
            this.setState({ currentTime: video.currentTime });
    };

    handleDurationChange() {
        const video = this.videoRef.current;
        const newValue = video.duration ? Math.round(video.duration) : 0;
        this.setState({ videoDuration:  newValue});
    };

    toggleLoop() {
        this.setState({ isLooped:  !this.state.isLooped});
    }

    render() {
        const { file } = this.props;
        if(!file)
            return <></>;

        const { video, isLooped, isMuted, isPaused, currentTime, videoDuration } = this.state;

        return (<>
            <video
                ref={this.videoRef}
                key={file.getUrl()}
                autoPlay={true}
                loop={isLooped}
                muted={isMuted}
                src={file.getUrl()}
                onPause={this.handlePause}
                onEnded={this.handleEnded}
                onPlay={this.handlePlay}
                onTimeUpdate={this.handleTimeUpdate}
                onVolumeChange={this.handleVolumeChange}
                onDurationChange={this.handleDurationChange}
            />
            <VideoControls
                video={video}
                key={file.getUrl()+"vc"}
                isLooped={isLooped}
                isMuted={isMuted}
                isPaused={isPaused}
                currentTime={currentTime}
                videoDuration={videoDuration}
                toggleLoop={this.toggleLoop}
            />
        </>);
    };
}

export default Video;