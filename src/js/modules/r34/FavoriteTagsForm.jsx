import React, {useMemo, useState} from "react";
import {BsPlusLg} from "react-icons/bs";
import useFavoriteTags from "@hooks/useFavoriteTags";

const FavoriteTagsForm = ({ currentSource, onToggle }) => {
    const [value, setValue] = useState("");
    const { favoriteTags, addFavTag } = useFavoriteTags();

    const filteredTags = useMemo(() => {
        return favoriteTags.filter(tag => tag.remote_type === currentSource);
    }, [favoriteTags, currentSource]);

    const handleClickAddFavTag = () => {
        if (!value.trim()) return;

        addFavTag(value, currentSource);
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
                <button className="btn btn-secondary" type="button" onClick={handleClickAddFavTag}>
                    <BsPlusLg />
                </button>
            </div>
        </>
    );
};

export default React.memo(FavoriteTagsForm);
