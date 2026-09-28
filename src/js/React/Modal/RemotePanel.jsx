import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ensureTags, getAllTags, subscribe} from "@controllers/TagsController";
import {FILE_TYPES} from "@/Constants";
import {openExternalUrl} from "@/Infrastructure/Ipc";
import LibraryService from "@services/LibraryService";
import useFavoriteTags from "@hooks/useFavoriteTags";
import {addTag, runSearch, tagState} from "@modules/r34/booruQuery";
import {TAG_KINDS, fmtCount, rememberKinds, tagKind, useTagKinds} from "@modules/r34/tagKinds";
import CollectionTreeSelect, {pushRecentCollection} from "../Library/Collection/CollectionTreeSelect";
import {markInLibrary} from "@modules/r34/libraryLinks";

const RATING_LABEL = { safe: 'Safe', general: 'General', sensitive: 'Sensitive', questionable: 'Questionable', explicit: 'Explicit' };

// Side panel for a booru post: what it is (score, rating, size, date), actions
// (open the post, find similar, save to the library) and its tags grouped by
// category — click a tag to add it to the search, hover for more.
const RemotePanel = ({ file }) => {
    const [version, setVersion] = useState(0);
    const [copied, setCopied]   = useState(null);
    const [picking, setPicking] = useState(false);
    const [saving, setSaving]   = useState(null);   // null | 'busy' | { ok, message }
    const [withTags, setWithTags] = useState(true);
    const { isFavTag, addFavTag, removeFavTag } = useFavoriteTags();
    const [dims, setDims] = useState(file.width > 0 && file.height > 0 ? { width: file.width, height: file.height } : null);

    useEffect(() => { if (file?.tags?.length) ensureTags(file.tags, file.remoteType); }, [file.tags]);
    useEffect(() => subscribe(() => setVersion(v => v + 1)), []);
    useEffect(() => { setSaving(null); setPicking(false); }, [file.uniqueId]);

    useEffect(() => {
        if (dims) return;
        let cancelled = false;
        file.getSize().then(s => { if (!cancelled && s) setDims(s); });
        return () => { cancelled = true; };
    }, [file.uniqueId]);

    const meta = useMemo(() => {
        const map = new Map();
        getAllTags().forEach(t => map.set(t.name, t));
        rememberKinds([...map.values()]);
        return map;
    }, [version]);

    const tagNames = useMemo(() => (file.tags || []).filter(n => n && n.trim()), [file.tags]);
    const kindOf = useTagKinds(tagNames);

    const groups = useMemo(() => {
        const by = {};
        tagNames.forEach(name => {
            const m = meta.get(name);
            const kind = m ? tagKind(m.type) : kindOf(name);
            (by[kind] ||= []).push({ name, count: m?.count || 0 });
        });
        return Object.entries(by)
            .sort(([a], [b]) => (TAG_KINDS[a]?.order ?? 9) - (TAG_KINDS[b]?.order ?? 9))
            .map(([kind, tags]) => ({ kind, tags: tags.sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)) }));
    }, [tagNames, meta, kindOf]);

    const flash = useCallback((key) => {
        setCopied(key);
        setTimeout(() => setCopied(c => (c === key ? null : c)), 800);
    }, []);

    const copy = (text, key) => { navigator.clipboard.writeText(text).catch(() => {}); flash(key); };

    // Artist + characters (+ copyright when there are no characters) → "more like this".
    const similar = () => {
        const pick = (kind) => groups.find(g => g.kind === kind)?.tags.map(t => t.name) || [];
        const chars = pick('character').slice(0, 2);
        const tags = [...pick('artist').slice(0, 1), ...(chars.length ? chars : pick('copyright').slice(0, 1))];
        if (tags.length) runSearch({ tags });
    };

    const save = async (collectionId) => {
        setPicking(false);
        setSaving('busy');
        pushRecentCollection(collectionId);
        try {
            const res = await LibraryService.importUrl({
                url: file.getUrl(),
                collectionId,
                tags: withTags ? tagNames : [],
                sourceUrl: file.sourceUrl,
            });
            if (res?.results?.length || res?.skipped?.length) markInLibrary(file.sourceUrl);
            if (res?.results?.length) setSaving({ ok: true, message: 'Сохранено в библиотеку' });
            else if (res?.skipped?.length) setSaving({ ok: false, message: res.skipped[0].reason === 'trashed' ? 'Такой файл лежит в корзине' : 'Уже есть в библиотеке' });
            else setSaving({ ok: false, message: String(res?.errors?.[0]?.error || 'Не удалось сохранить').split('\n').pop() });
        } catch (e) {
            setSaving({ ok: false, message: e.message });
        }
    };

    const postId = file.remoteId;
    const facts = [
        dims && { icon: 'bi-aspect-ratio', text: `${dims.width}×${dims.height}` },
        file.score != null && { icon: 'bi-star-fill', text: file.score, cls: 'score' },
        file.time && { icon: 'bi-calendar3', text: new Date(file.time * 1000).toLocaleDateString('ru-RU') },
        { icon: file.type === FILE_TYPES.VIDEO ? 'bi-play-btn' : 'bi-image', text: file.type === FILE_TYPES.VIDEO ? 'Видео' : 'Изображение' },
    ].filter(Boolean);

    return (
        <div className="metadata-panel remote-panel rp">
            <div className="metadata-preview">
                <img src={file.previewUrl || file.thumbUrl} alt="" />
                {file.remoteRating && (
                    <span className={`rp-rating r-${file.remoteRating}`}>{RATING_LABEL[file.remoteRating] || file.remoteRating}</span>
                )}
            </div>

            <div className="metadata-content">
                <div className="rp-head">
                    {postId && <span className="rp-id">#{postId}</span>}
                    <div className="rp-facts">
                        {facts.map(f => <span key={f.icon} className={f.cls || ''}><i className={`bi ${f.icon}`} /> {f.text}</span>)}
                    </div>
                </div>

                <div className="rp-actions">
                    {file.sourceUrl && (
                        <button className="fp-action" onClick={() => openExternalUrl(file.sourceUrl)} title="Открыть страницу поста в браузере">
                            <i className="bi bi-box-arrow-up-right" /><span>Пост</span>
                        </button>
                    )}
                    <button className="fp-action" onClick={similar} title="Искать по художнику и персонажам">
                        <i className="bi bi-stars" /><span>Похожее</span>
                    </button>
                    <button className="fp-action" onClick={() => copy(tagNames.join(' '), '__all__')} title="Скопировать все теги">
                        <i className={`bi ${copied === '__all__' ? 'bi-check2' : 'bi-clipboard'}`} /><span>Теги</span>
                    </button>
                </div>

                <div className="rp-save">
                    {saving && saving !== 'busy' ? (
                        <div className={`fp-result ${saving.ok ? 'ok' : 'warn'}`}>
                            <i className={`bi ${saving.ok ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill'}`} /> {saving.message}
                        </div>
                    ) : (
                        <div className="rp-save-row">
                            <button className="fp-import-btn" disabled={saving === 'busy'} onClick={() => setPicking(v => !v)}>
                                {saving === 'busy'
                                    ? <><i className="bi bi-arrow-repeat spin" /> Сохранение…</>
                                    : <><i className="bi bi-box-arrow-in-down" /> В библиотеку…</>}
                            </button>
                            <label className="rp-withtags" title="Сохранить вместе с тегами поста">
                                <input type="checkbox" checked={withTags} onChange={e => setWithTags(e.target.checked)} /> теги
                            </label>
                        </div>
                    )}
                    {picking && (
                        <div className="rp-pick">
                            <CollectionTreeSelect value={undefined} onSelect={save} onClose={() => setPicking(false)} />
                        </div>
                    )}
                </div>

                {groups.map(({ kind, tags }) => (
                    <div key={kind} className="rp-group">
                        <div className={`rp-group-title kind-${kind}`}>
                            <span className="rp-dot" /> {TAG_KINDS[kind]?.label || kind}
                            <span className="rp-group-count">{tags.length}</span>
                        </div>
                        <div className="rp-tags">
                            {tags.map(({ name, count }) => {
                                const st = tagState(name);
                                const fav = isFavTag(name, file.remoteType);
                                return (
                                    <div key={name} className={`rp-tag kind-${kind} ${st || ''}`}>
                                        <button className="rp-tag-name" onClick={() => addTag(name)} title="Добавить в поиск">
                                            {name}
                                        </button>
                                        {count > 0 && <span className="rp-tag-count">{fmtCount(count)}</span>}
                                        <span className="rp-tag-tools">
                                            <button onClick={() => addTag(name, { exclude: true })} title="Исключить из поиска"><i className="bi bi-dash-circle" /></button>
                                            <button className={fav ? 'on' : ''} onClick={() => (fav ? removeFavTag(name, file.remoteType) : addFavTag(name, file.remoteType))}
                                                    title={fav ? 'Убрать из избранных тегов' : 'В избранные теги'}>
                                                <i className={`bi ${fav ? 'bi-star-fill' : 'bi-star'}`} />
                                            </button>
                                            <button onClick={() => copy(name, name)} title="Скопировать">
                                                <i className={`bi ${copied === name ? 'bi-check2' : 'bi-copy'}`} />
                                            </button>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RemotePanel;
