import {useEffect, useState} from 'react';
import TagsService from '@services/TagsService';

// Booru tag categories. Numeric codes are shared by rule34 and gelbooru (tag API);
// the r34 autocomplete returns them as words instead.
export const TAG_KINDS = {
    artist:    { label: 'Художник',  order: 1 },
    copyright: { label: 'Копирайт',  order: 2 },
    character: { label: 'Персонаж',  order: 3 },
    general:   { label: 'Общие',     order: 4 },
    meta:      { label: 'Мета',      order: 5 },
    unknown:   { label: 'Прочие',    order: 6 },
};

const BY_CODE = { 0: 'general', 1: 'artist', 2: 'general', 3: 'copyright', 4: 'character', 5: 'meta', 6: 'meta' };
const BY_WORD = {
    general: 'general', tag: 'general', artist: 'artist', copyright: 'copyright',
    character: 'character', metadata: 'meta', meta: 'meta', deprecated: 'meta',
};

export function tagKind(type) {
    if (type == null || type === '') return 'unknown';
    if (typeof type === 'number' || /^\d+$/.test(String(type))) return BY_CODE[Number(type)] || 'unknown';
    return BY_WORD[String(type).toLowerCase()] || 'unknown';
}

// 1234 → "1.2K", 5398473 → "5.4M"
export function fmtCount(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
    return String(n);
}

// ─── Category lookup for arbitrary tag names (local tag DB, cached per session) ─

const kindCache = new Map();   // name → kind ('unknown' once looked up without a hit)

export function useTagKinds(names) {
    const [, bump] = useState(0);
    const key = names.join(' ');
    useEffect(() => {
        const missing = [...new Set(names)].filter(n => n && !kindCache.has(n));
        if (!missing.length) return;
        let cancelled = false;
        TagsService.getByNames(missing).then(rows => {
            missing.forEach(n => kindCache.set(n, 'unknown'));
            (rows || []).forEach(r => kindCache.set(r.name, tagKind(r.type)));
            if (!cancelled) bump(v => v + 1);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
    return (name) => kindCache.get(name) || 'unknown';
}

export function rememberKinds(tags) {
    tags.forEach(t => { if (t?.name && t.type != null) kindCache.set(t.name, tagKind(t.type)); });
}
