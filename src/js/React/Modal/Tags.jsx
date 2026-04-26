import React, {useCallback, useEffect, useMemo, useState} from "react";
import {ensureTags, getAllTags, getTagOrder, subscribe} from "../../Controllers/TagsController";

const Tags = ({ file }) => {
    const [version, setVersion] = useState(0);
    const [activeTag, setActiveTag] = useState(null);

    useEffect(() => {
        if (!file?.tags?.length) return;

        ensureTags(file.tags);

        const unsub = subscribe(() => {
            setVersion(v => v + 1);
        });

        return unsub;
    }, [file.tags]);

    const tagsMap = useMemo(() => {
        const map = new Map();
        getAllTags().forEach(tag => {
            map.set(tag.name, tag);
        });
        return map;
    }, [version]);

    const visibleTags = useMemo(() => {
        if (!file?.tags) return [];

        return file.tags
            .filter(name => name && name.trim())
            .map(name => {
                const metadata = tagsMap.get(name);

                return {
                    name,
                    metadata,
                    order: getTagOrder(metadata?.type)
                };
            })
            .sort((a, b) => a.order - b.order);
    }, [file.tags, tagsMap]);

    const handleClick = useCallback((name) => {
        navigator.clipboard.writeText(name).catch(console.error);

        setActiveTag(name);
        setTimeout(() => setActiveTag(null), 500);

        setTimeout(() => {
            setActiveTag(null);
        }, 200);
    }, []);

    if (visibleTags.length === 0) return null;

    return (
        <div className="col-7 text-center tags">
            {visibleTags.map(({ name, metadata }) => {
                const cls = metadata
                    ? `tag-type-${metadata.type}`
                    : "bg-secondary";

                const isActive = activeTag === name;

                return (
                    <span
                        key={name}
                        className={`badge m-1 ${cls} tag ${isActive ? "tag-active" : ""}`}
                        onClick={() => handleClick(name)}
                    >
                        {name}
                    </span>
                );
            })}
        </div>
    );
};

export default Tags;