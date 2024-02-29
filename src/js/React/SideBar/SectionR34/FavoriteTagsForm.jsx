import React, {Component} from "react";
import {AddFavTag} from "../../../FavController";
import {BsPlusLg} from "react-icons/bs";
import {ToggleTag} from "../../../r34";

class FavoriteTagsForm extends Component {
    constructor(props) {
        super(props);

        this.inputRef = React.createRef();
        this.addFavTag = this.addFavTag.bind(this);
    }

    addFavTag() {
        let input = this.inputRef.current;
        AddFavTag(input.value, this.props.currentSource);
        input.value = "";
    }

    render() {
        const { favTagsArray, currentSource } = this.props;
        return <>
            <form className="tag-list" id="tags-fav-select">
                {favTagsArray.map((tag, index) => {
                    // noinspection JSUnresolvedReference
                    if(tag.remote_type !== currentSource)
                        return null;

                    return (<div className="btn-group" key={index}>
                        <button
                            className="btn btn-primary"
                            onClick={() => ToggleTag(tag.tag)}
                            type="button"
                        >
                            {tag.tag}
                        </button>
                    </div>)
                })}
            </form>
            <div className="input-group">
                <input
                    className="form-control"
                    type="text"
                    autoFocus=""
                    placeholder="Place tag..."
                    ref={this.inputRef}
                />
                <button className="btn btn-secondary" type="button" onClick={this.addFavTag}>
                    <BsPlusLg />
                </button>
            </div>
        </>;
    }
}

export default FavoriteTagsForm;