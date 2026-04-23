import React, {useEffect, useMemo, useState} from "react";
import {ensureTags, getTag, getTagOrder, subscribe} from "../../TagsController";

const Tags = ({ file }) => {
    const [version, setVersion] = useState(0);

    useEffect(() => {
        if (!file?.tags) return;

        ensureTags(file.tags); //TODO current source

        const unsub = subscribe(() => {
            setVersion(v => v + 1);
        });

        return unsub;
    }, [file.tags]);

    const visibleTags = useMemo(() => {
        return file.tags
            .map(name => ({
                name,
                metadata: getTag(name)
            }))
            .sort((a, b) => {
                const ta = getTagOrder(a.metadata?.type);
                const tb = getTagOrder(b.metadata?.type);
                return ta - tb;
            });
    }, [file.tags, version]);

    return (
        <div className="col-7 text-center tags">
            {visibleTags.map(({ name, metadata }) => {
                const cls = metadata ? `tag-type-${metadata.type}` : "bg-secondary";

                return (
                    <span key={name} className={`badge m-1 ${cls}`}>
                        {name}
                    </span>
                );
            })}
        </div>
    );
};

export default Tags;