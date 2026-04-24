import React, {useEffect, useRef, useState} from "react";
import {SearchMedia} from "../../../Controllers/R34Controller";
import FavoriteTagsForm from "./FavoriteTagsForm";
import {fetchTagSuggestions} from "../../../Controllers/TagsController";

const TagSearch = ({currentSource, favTagsArray}) => {
    const [inputValue, setInputValue] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [score, setScore] = useState(0);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const onSearch = () => {
        const finalQuery = `${inputValue.trim()} score:>=${score}`;
        SearchMedia(finalQuery);
    };

    const lastQueryRef = useRef("");

    const handleInput = async (e) => {
        const val = e.target.value;
        setInputValue(val);

        lastQueryRef.current = val;

        const list = await fetchTagSuggestions(val, currentSource);

        if (lastQueryRef.current !== val) return; // protect overloading

        const words = val.trim().split(/\s+/);
        const lastWord = words[words.length - 1]?.toLowerCase();

        const hasExactMatch = list.some(suggestion =>
            suggestion.value.toLowerCase() === lastWord
        );

        setSuggestions(list);
        setShowDropdown(list.length > 0 && !hasExactMatch);
    };

    const insertTag = (tag) => {
        const match = inputValue.match(/[^ -][^ ]*$/);
        const newValue = match
            ? inputValue.replace(match[0], tag + " ")
            : inputValue + (inputValue ? " " : "") + tag + " ";

        setInputValue(newValue);
        setShowDropdown(false);
    };

    const handleToggle = (tagToToggle) => {
        setInputValue(prev => {
            let tags = prev.split(' ').filter(t => t.trim() !== "");
            const negated = '-' + tagToToggle;

            if (tags.includes(tagToToggle)) {
                return tags.filter(t => t !== tagToToggle).join(' ');
            } else if (tags.includes(negated)) {
                return tags.filter(t => t !== negated).join(' ');
            } else {
                return [...tags, tagToToggle].join(' ');
            }
        });
    };

    const removeTag = (tagToRemove) => {
        setInputValue(prev =>
            prev
                .split(' ')
                .filter(t => t.trim() && t !== tagToRemove)
                .join(' ')
        );
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSearch();
            setShowDropdown(false);
        }
    };

    return (
        <>
            <div className="tag-search-container">
                <div className="input-group">
                    <input
                        className="form-control"
                        type="text"
                        value={inputValue}
                        onChange={handleInput}
                        placeholder="Tags..."
                        onKeyDown={handleKeyDown}
                    />
                    <button className="btn btn-secondary" onClick={onSearch}>
                        <i className="bi bi-search"/>
                    </button>

                    {showDropdown && (
                        <ul ref={dropdownRef} className="dropdown-menu show w-100">
                            {suggestions.map((s, i) => (
                                <li key={i} className="dropdown-item" onClick={() => insertTag(s.value)}>
                                    {s.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="mt-2">
                    <label className="form-label small text-white-50">Minimum Score:</label>
                    <input
                        className="form-control form-control-sm"
                        type="number"
                        min={0}
                        max={2000}
                        step={10}
                        value={score}
                        onChange={(e) => setScore(Number(e.target.value))}
                    />
                </div>

                <div className="tag-list mt-2">
                    {inputValue.split(' ').filter(t => t.trim()).map((tag, i) => (
                        <div className="btn-group m-1" key={i}>
                            <button className={`btn btn-sm ${tag.startsWith('-') ? 'btn-danger' : 'btn-success'}`}>
                                {tag}
                            </button>
                            <button className="btn btn-sm btn-light" onClick={() => removeTag(tag)}>
                                <i className="bi bi-x" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            <hr/>
            <FavoriteTagsForm
                currentSource={currentSource}
                favTagsArray={favTagsArray}
                onToggle={handleToggle}
            />
        </>
    );
};

export default TagSearch;