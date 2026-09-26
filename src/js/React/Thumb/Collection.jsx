import React from 'react';
import FolderTile from '../Common/FolderTile';

const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
};

// Sub-collection tile in the library grid: accent-coloured folder art with a peek
// at what's inside. Opening is handled by the surrounding Thumb (click).
const Collection = ({ file }) => {
    const { itemCount = 0, childCount = 0, previews = [] } = file._meta || {};
    const meta = [
        `${itemCount} ${plural(itemCount, 'файл', 'файла', 'файлов')}`,
        childCount ? `${childCount} ${plural(childCount, 'коллекция', 'коллекции', 'коллекций')}` : null,
    ].filter(Boolean).join(' · ');

    return (
        <div className="collection-thumb">
            <FolderTile
                variant="collection"
                name={file.title}
                meta={meta}
                previews={previews}
                icon={file.icon ? null : 'bi-collection'}
            />
        </div>
    );
};

export default Collection;
