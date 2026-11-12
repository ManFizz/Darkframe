import React, {useRef, useState} from 'react';

// Windows-style folder tile: a back plate with a tab, up to three preview "papers"
// fanned out of it, and a translucent front pocket. Shared by the Folders browser
// (variant "fs", classic yellow) and library collections (variant "collection",
// accent-coloured) so the two read as siblings but never get mixed up.
const Paper = ({ src, index }) => {
    const [state, setState] = useState('loading');   // loading → ok | broken
    if (state === 'broken') return null;
    return (
        <img
            className={`ftile-paper p${index} ${state === 'ok' ? 'ready' : ''}`}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setState('ok')}
            onError={() => setState('broken')}
        />
    );
};

// `dropType` + `onDropData`: accept a drag carrying that dataTransfer type.
const FolderTile = ({
    name, meta, previews = [], variant = 'fs', icon = null, badge = null,
    active = false, denied = false, onOpen, onContextMenu, title, dropType, onDropData,
}) => {
    const [over, setOver] = useState(false);
    const depth = useRef(0);
    const accepts = (e) => !!dropType && !denied && [...e.dataTransfer.types].includes(dropType);
    const drop = dropType ? {
        onDragEnter: (e) => { if (accepts(e)) { depth.current++; setOver(true); } },
        onDragLeave: () => { if (--depth.current <= 0) { depth.current = 0; setOver(false); } },
        onDragOver: (e) => { if (accepts(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } },
        onDrop: (e) => {
            depth.current = 0;
            setOver(false);
            if (!accepts(e)) return;
            e.preventDefault();
            onDropData?.(e.dataTransfer.getData(dropType), e);
        },
    } : {};
    return (
    <div
        className={`ftile ftile--${variant} ${active ? 'active' : ''} ${denied ? 'denied' : ''} ${over ? 'drop-over' : ''}`}
        onClick={onOpen}
        onContextMenu={onContextMenu}
        {...drop}
        onKeyDown={e => { if (e.key === 'Enter') onOpen?.(e); }}
        role="button"
        tabIndex={0}
        title={title || name}
    >
        <div className="ftile-art">
            <div className="ftile-back" />
            <div className="ftile-papers">
                {previews.slice(0, 3).map((src, i) => <Paper key={src} src={src} index={i} />)}
            </div>
            <div className="ftile-front">
                {!previews.length && (
                    <i aria-hidden="true" className={`bi ${denied ? 'bi-lock-fill' : icon || (variant === 'collection' ? 'bi-collection' : 'bi-folder2-open')}`} />
                )}
            </div>
            {badge != null && <span className="ftile-badge">{badge}</span>}
        </div>
        <div className="ftile-name">{name}</div>
        {meta && <div className="ftile-meta">{meta}</div>}
    </div>
    );
};

export default React.memo(FolderTile);
