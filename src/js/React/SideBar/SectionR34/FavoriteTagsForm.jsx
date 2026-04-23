import React, {useMemo, useState} from "react";
import {AddFavTag} from "../../../FavController";
import {BsPlusLg} from "react-icons/bs";

const FavoriteTagsForm = ({ favTagsArray, currentSource, onToggle }) => {
    const [value, setValue] = useState("");

    const filteredTags = useMemo(() => {
        return favTagsArray.filter(tag => tag.remote_type === currentSource);
    }, [favTagsArray, currentSource]);

    const addFavTag = () => {
        if (!value.trim()) return;

        AddFavTag(value, currentSource);
        setValue("");
    };

    return (
        <>
            <div className="tag-list">
                {filteredTags.map(tag => (
                    <div className="btn-group" key={`${tag.tag}-${tag.remote_type}`}>
                        <button
                            className="btn btn-primary"
                            onClick={() => onToggle?.(tag.tag)}
                            type="button"
                        >
                            {tag.tag}
                        </button>
                    </div>
                ))}
            </div>

            <div className="input-group">
                <input
                    className="form-control"
                    type="text"
                    placeholder="Place tag..."
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
                <button className="btn btn-secondary" type="button" onClick={addFavTag}>
                    <BsPlusLg />
                </button>
            </div>
        </>
    );
};

export default React.memo(FavoriteTagsForm);