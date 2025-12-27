import React, {useMemo} from 'react';
import {GetTags} from "../../TagsController";

const isTagInvalid = (tag) => !tag || tag.trim().length === 0;

const Tags = ({ file }) => {
    const allTagsMetadata = GetTags();

    const visibleTags = useMemo(() => {
        const tagsMap = new Map(allTagsMetadata.map(t => [t.name, t]));

        const tagsArray = Array.isArray(file.tags) ? file.tags : [];

        return tagsArray
            .filter(tag => tag && tag.trim())
            .map(name => ({
                name,
                metadata: tagsMap.get(name)
            }))
            .filter(item => !item.metadata || item.metadata.type !== 6);
    }, [file.tags, allTagsMetadata]);

    if (visibleTags.length === 0) return null;

    return (
        <div
            className="col-md-6 d-flex flex-wrap justify-content-center mx-auto"
            id="modal-tags"
        >
            {visibleTags.map(({ name, metadata }) => {
                const tagTypeClass = metadata ? `tag-type-${metadata.type}` : 'bg-primary';
                return (
                    <span
                        key={name}
                        className={`badge m-1 ${tagTypeClass}`}
                    >
                        {name}
                    </span>
                );
            })}
        </div>
    );
};

export default Tags;