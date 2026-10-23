import React, {useEffect, useRef, useState} from 'react';
import {fetchTagSuggestions, getAllTags} from '@controllers/TagsController';
import {addTag, normTag, removeTag, runSearch, toggleExclude, useBooruQuery, useSearchStatus} from './booruQuery';
import {tagKind, fmtCount, useTagKinds} from './tagKinds';
import TagsService from '@services/TagsService';
import {queryKey, setView} from './booruQuery';
import {saveSearch, useSavedSearches} from './savedSearches';
import {notify} from '@services/NotificationService';
import useFavoriteTags from '@hooks/useFavoriteTags';

// Autocomplete payloads differ per booru: r34 → { label: "cat (123)", value, type:
// "general" }, gelbooru → { name, count, type: 0 }. Normalise to { name, count, kind }.
function normalizeSuggestion(s) {
    const name = s.value || s.name;
    let count = Number(s.count) || 0;
    if (!count && typeof s.label === 'string') {
        const m = s.label.match(/\(([\d,.\s]+)\)\s*$/);
        if (m) count = Number(m[1].replace(/[^\d]/g, '')) || 0;
    }
    const known = getAllTags().find(t => t.name === name);
    return { name, count, kind: tagKind(s.type ?? known?.type) };
}

// Bookmark: remembers the whole query (tags + modifiers). On a saved query it opens
// the saved-searches page; removing is done there, behind a confirm.
const SaveButton = ({ sourceType, q }) => {
    const saved = useSavedSearches(sourceType);
    const key = queryKey(q);
    const isSaved = saved.some(s => s.key === key);
    const empty = !q.tags.length && !q.minScore && q.sort === 'new' && q.rating === 'any';

    const onClick = async (e) => {
        e.stopPropagation();
        if (isSaved) { setView('saved'); return; }
        await saveSearch(sourceType, { tags: q.tags, minScore: q.minScore, sort: q.sort, rating: q.rating });
        notify({
            message: 'Поиск сохранён',
            type: 'success',
            action: { label: 'Все сохранённые', onClick: () => setView('saved') },
        });
    };

    return (
        <button className={`bs-save ${isSaved ? 'on' : ''}`} disabled={empty && !isSaved} onClick={onClick}
                title={isSaved ? 'Поиск сохранён — открыть сохранённые' : 'Запомнить этот поиск'}>
            <i className={`bi ${isSaved ? 'bi-bookmark-check-fill' : 'bi-bookmark-plus'}`} />
        </button>
    );
};

const BooruSearchBar = ({ sourceType }) => {
    // Right click on a tag (a chip or a suggestion): into the favourites / out of them.
    const { favoriteTags, addFavTag, removeFavTag } = useFavoriteTags();
    const isFav = (name) => favoriteTags.some(f => f.tag === name && f.remote_type === sourceType);
    const toggleFav = (name) => {
        if (isFav(name)) {
            removeFavTag(name, sourceType);
            notify({ message: `«${name}» убран из избранного`, type: 'info', action: { label: 'Вернуть', onClick: () => addFavTag(name, sourceType) } });
        } else {
            addFavTag(name, sourceType);
            notify({ message: `«${name}» в избранном`, type: 'success' });
        }
    };
    const q = useBooruQuery();
    const status = useSearchStatus();
    const [text, setText] = useState('');
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(false);
    const [cursor, setCursor] = useState(-1);
    const inputRef = useRef(null);
    const boxRef = useRef(null);
    const lastQuery = useRef('');
    const kindOf = useTagKinds(q.tags.map(t => t.replace(/^-/, '')));

    useEffect(() => {
        const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    // Debounced autocomplete for the word being typed (a leading "-" is kept aside).
    useEffect(() => {
        const word = text.replace(/^-/, '').trim();
        lastQuery.current = word;
        if (word.length < 2) { setItems([]); return; }
        const timer = setTimeout(async () => {
            const list = await fetchTagSuggestions(word, sourceType).catch(() => []);
            if (lastQuery.current !== word) return;
            const norm = list.map(normalizeSuggestion).filter(s => s.name).slice(0, 10);
            // r34's autocomplete has no categories — colour them from the local tag DB.
            const unknown = norm.filter(s => s.kind === 'unknown').map(s => s.name);
            if (unknown.length) {
                const rows = await TagsService.getByNames(unknown).catch(() => []);
                const types = new Map((rows || []).map(r => [r.name, r.type]));
                norm.forEach(s => { if (types.has(s.name)) s.kind = tagKind(types.get(s.name)); });
            }
            if (lastQuery.current !== word) return;
            setItems(norm);
            setCursor(-1);
            setOpen(true);
        }, 160);
        return () => clearTimeout(timer);
    }, [text, sourceType]);

    const commit = (name) => {
        if (!name) return;
        addTag(name, { exclude: text.startsWith('-') });
        setText('');
        setItems([]);
        setOpen(false);
        inputRef.current?.focus();
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); setOpen(true); setCursor(c => Math.min(items.length - 1, c + 1)); return; }
        if (e.key === 'ArrowUp' && items.length)   { e.preventDefault(); setCursor(c => Math.max(-1, c - 1)); return; }
        if (e.key === 'Escape') { setOpen(false); return; }
        if (e.key === 'Tab' && open && items.length) { e.preventDefault(); commit(items[Math.max(0, cursor)].name); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (open && cursor >= 0 && items[cursor]) { commit(items[cursor].name); return; }
            if (text.trim()) {                       // typed words → chips, then search
                text.trim().split(/\s+/).forEach(w => addTag(w));
                setText('');
                setOpen(false);
            }
            runSearch();
            return;
        }
        if (e.key === 'Backspace' && !text && q.tags.length) {
            removeTag(q.tags[q.tags.length - 1]);
            return;
        }
        if (e.key === ' ' && text.trim()) {          // space finishes a tag
            e.preventDefault();
            commit(normTag(text.replace(/^-/, '')));
        }
    };

    return (
        <div className="booru-search" ref={boxRef}>
            <div className="bs-field" onClick={() => inputRef.current?.focus()}>
                <i className={`bi ${status.loading ? 'bi-arrow-repeat spin' : 'bi-search'} bs-icon`} />
                {q.tags.map(t => {
                    const excluded = t.startsWith('-');
                    const name = t.replace(/^-/, '');
                    const kind = kindOf(name);
                    return (
                        <span key={t} className={`bs-chip kind-${kind} ${excluded ? 'excluded' : ''} ${isFav(name) ? 'fav' : ''}`}
                              title={`${excluded ? 'Исключён — нажми, чтобы включить' : 'Нажми, чтобы исключить'} · ПКМ — ${isFav(name) ? 'убрать из избранного' : 'в избранное'}`}
                              onClick={e => { e.stopPropagation(); toggleExclude(t); }}
                              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); toggleFav(name); }}>
                            {isFav(name) && <i className="bi bi-star-fill bs-chip-fav" />}
                            {excluded && <i className="bi bi-dash-circle" />}
                            {name}
                            <button onClick={e => { e.stopPropagation(); removeTag(t); }} title="Убрать">
                                <i className="bi bi-x" />
                            </button>
                        </span>
                    );
                })}
                <input
                    ref={inputRef}
                    value={text}
                    placeholder={q.tags.length ? '' : 'Теги через пробел, «-тег» — исключить…'}
                    spellCheck={false}
                    onChange={e => setText(e.target.value)}
                    onFocus={() => items.length && setOpen(true)}
                    onKeyDown={onKeyDown}
                />
                <SaveButton sourceType={sourceType} q={q} />
                <button className="bs-go" onClick={e => { e.stopPropagation(); runSearch(); }} title="Искать (Enter)">
                    Искать
                </button>
            </div>

            {open && items.length > 0 && (
                <div className="bs-drop">
                    {items.map((s, i) => (
                        <div key={s.name}
                             className={`bs-opt ${i === cursor ? 'cursor' : ''}`}
                             onMouseMove={() => setCursor(i)}
                             onMouseDown={e => { e.preventDefault(); if (e.button === 0) commit(s.name); }}
                             onContextMenu={e => { e.preventDefault(); toggleFav(s.name); }}
                             title={`ПКМ — ${isFav(s.name) ? 'убрать из избранного' : 'в избранное'}`}>
                            <span className={`bs-dot kind-${s.kind}`} />
                            <span className="bs-opt-name">{s.name}</span>
                            {isFav(s.name) && <i className="bi bi-star-fill bs-opt-fav" />}
                            {s.count > 0 && <span className="bs-opt-count">{fmtCount(s.count)}</span>}
                        </div>
                    ))}
                    <div className="bs-drop-hint"><kbd>Tab</kbd> выбрать · <kbd>Enter</kbd> искать · «-» исключить · ПКМ — в избранное</div>
                </div>
            )}
        </div>
    );
};

export default BooruSearchBar;
