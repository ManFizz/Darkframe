import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ensureTags, getAllTags, getTagOrder, subscribe} from "@controllers/TagsController";
import {FILE_TYPES} from "@/Constants";

// Read-only side panel for remote booru files (r34 / realbooru). Reuses the glass
// ".metadata-panel" shell from the library, but there's nothing to edit here —
// just the tags (click to copy), a thumbnail and a bit of info.
const RemotePanel = ({ file }) => {
    const [version, setVersion] = useState(0);
    const [copied, setCopied]   = useState(null);   // name of the tag that just flashed "copied"
    const [dims, setDims]       = useState(
        file.width > 0 && file.height > 0 ? { width: file.width, height: file.height } : null
    );

    useEffect(() => { if (file?.tags?.length) ensureTags(file.tags); }, [file.tags]);
    useEffect(() => subscribe(() => setVersion(v => v + 1)), []);

    // Remote items often ship without dimensions; resolve them lazily from the thumb.
    useEffect(() => {
        if (dims) return;
        let cancelled = false;
        file.getSize().then(s => { if (!cancelled && s) setDims(s); });
        return () => { cancelled = true; };
    }, [file.uniqueId]);

    const tagsMap = useMemo(() => {
        const map = new Map();
        getAllTags().forEach(tag => map.set(tag.name, tag));
        return map;
    }, [version]);

    const visibleTags = useMemo(() => {
        if (!file?.tags) return [];
        return file.tags
            .filter(name => name && name.trim())
            .map(name => {
                const metadata = tagsMap.get(name);
                return { name, metadata, order: getTagOrder(metadata?.type) };
            })
            .sort((a, b) => a.order - b.order);
    }, [file.tags, tagsMap]);

    const flash = useCallback((key) => {
        setCopied(key);
        setTimeout(() => setCopied(c => (c === key ? null : c)), 700);
    }, []);

    const copyTag = useCallback((name) => {
        navigator.clipboard.writeText(name).catch(console.error);
        flash(name);
    }, [flash]);

    const copyAll = useCallback(() => {
        navigator.clipboard.writeText(visibleTags.map(t => t.name).join(', ')).catch(console.error);
        flash('__all__');
    }, [visibleTags, flash]);

    const info = [
        ['Тип', file.type === FILE_TYPES.VIDEO ? 'Видео' : 'Изображение'],
        dims && ['Разрешение', `${dims.width} × ${dims.height}`],
        file.time && ['Добавлено', new Date(file.time * 1000).toLocaleDateString('ru-RU')],
    ].filter(Boolean);

    return (
        <div className="metadata-panel remote-panel">
            <div className="metadata-preview">
                {file.type === FILE_TYPES.VIDEO
                    ? <video src={file.thumbUrl} muted loop autoPlay />
                    : <img src={file.thumbUrl} alt={file.title} />}
            </div>

            <div className="metadata-content">
                {file.title && file.title !== 'Untitled' && (
                    <div className="remote-panel-title" title={file.title}>{file.title}</div>
                )}

                {visibleTags.length > 0 && (
                    <div className="metadata-section">
                        <label className="remote-tags-label">
                            <span>Теги <span className="remote-tag-count">{visibleTags.length}</span></span>
                            <button className="remote-copy-all" onClick={copyAll} title="Скопировать все теги">
                                <i className={`bi ${copied === '__all__' ? 'bi-check2' : 'bi-clipboard'}`} />
                            </button>
                        </label>
                        <div className="remote-tags">
                            {visibleTags.map(({ name, metadata }) => {
                                const cls = metadata ? `tag-type-${metadata.type || 0}` : 'bg-secondary';
                                return (
                                    <span
                                        key={name}
                                        className={`badge tag ${cls} ${copied === name ? 'tag-active' : ''}`}
                                        title="Нажми, чтобы скопировать"
                                        onClick={() => copyTag(name)}
                                    >
                                        {name}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}

                {info.map(([label, value]) => (
                    <div key={label} className="metadata-section">
                        <label>{label}</label>
                        <span className="metadata-value">{value}</span>
                    </div>
                ))}

                {file.sourceUrl && (
                    <div className="metadata-section">
                        <label>Источник</label>
                        <a
                            className="btn btn-sm btn-outline-secondary"
                            href={file.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <i className="bi bi-box-arrow-up-right me-1" />
                            Открыть источник
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RemotePanel;
