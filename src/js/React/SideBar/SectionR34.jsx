import React, {useEffect, useState} from 'react';
import TagSearch from "./SectionR34/TagSearch";
import {currentR34Source} from "../../R34Controller";

const SectionR34 = ({ currentSource, favTagsArray }) => {
    const [name, setName] = useState(null);

    useEffect(() => {
        setName(currentR34Source.name);
    }, [currentSource]);
    return (
        <section>
            <p className="h1">{name}</p>
            <p className="h6">Search by tags</p>

            <TagSearch
                currentSource={currentSource}
                favTagsArray={favTagsArray}
            />
        </section>
    );
};

export default React.memo(SectionR34);