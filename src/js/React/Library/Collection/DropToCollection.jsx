import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useCollections} from '@hooks/library/useCollections';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {DRAG_PATHS} from '@/Infrastructure/Ipc';
import {loadRecentCollections, pushRecentCollection} from './CollectionTreeSelect';
import {markInLibrary} from '@modules/r34/libraryLinks';

/**
 * Drag a booru post or a file from Folders and a collection panel slides out on the
 * right; dropping on a collection saves the dragged items into the library there.
 *
 * Booru posts are objects, not strings, so the drag source parks them here
 * (startPostDrag) and marks the drag with DRAG_POSTS; Folders files travel as
 * paths in DRAG_PATHS.
 */
export const DRAG_POSTS = 'application/x-darkframe-posts';

let draggedPosts = [];
export function startPostDrag(e, posts) {
    draggedPosts = posts;
    e.dataTransfer.setData(DRAG_POSTS, String(posts.length));
    e.dataTransfer.effectAllowed = 'copy';
}

const TYPES = [DRAG_POSTS, DRAG_PATHS];

const postsWord = (n) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'пост';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'поста';
    return 'постов';
};
const carries = (e) => TYPES.some(t => [...(e.dataTransfer?.types || [])].includes(t));

// Flat, fully expanded list (no typing while dragging, so no search / collapsing).
function flatten(tree, depth = 0, out = []) {
    tree.forEach(n => {
        if (n.isSmart) return;
        out.push({ id: n.id, name: n.name, icon: n.icon, count: n.itemCount || 0, depth });
        flatten(n.children || [], depth + 1, out);
    });
    return out;
}

async function savePosts(posts, collectionId) {
    let ok = 0, dup = 0, fail = 0;
    for (const f of posts) {
        try {
            const res = await LibraryService.importUrl({ url: f.getUrl(), collectionId, tags: f.tags || [], sourceUrl: f.sourceUrl });
            if (res?.results?.length) { ok++; markInLibrary(f.sourceUrl); }
            else if (res?.skipped?.length) { dup++; markInLibrary(f.sourceUrl); }
            else fail++;
        } catch { fail++; }
    }
    return { ok, dup, fail };
}

async function saveFiles(paths, collectionId) {
    const res = await LibraryService.importFiles({ filePaths: paths, collectionId });
    return { ok: res?.results?.length || 0, dup: res?.skipped?.length || 0, fail: res?.errors?.length || 0 };
}

const Row = ({ node, onDrop }) => {
    const [over, setOver] = useState(false);
    return (
        <div className={`dtc-row ${over ? 'over' : ''}`} style={{ paddingLeft: 12 + node.depth * 16 }}
             onDragOver={e => { if (carries(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); } }}
             onDragLeave={() => setOver(false)}
             onDrop={e => { setOver(false); onDrop(e, node); }}>
            {node.icon ? <span className="dtc-emoji">{node.icon}</span> : <i className={`bi ${node.id ? 'bi-folder' : 'bi-inbox'}`} />}
            <span className="dtc-name">{node.name}</span>
            {node.count > 0 && <span className="dtc-count">{node.count}</span>}
        </div>
    );
};

// Hover strip above / below the list: holding a dragged item over it scrolls the
// list that way (the wheel also works, see dragScroll.js).
const ScrollZone = ({ dir, listRef, visible }) => {
    const raf = useRef(null);
    const until = useRef(0);
    const step = () => {
        const el = listRef.current;
        if (el && performance.now() < until.current) {
            el.scrollTop += dir * 14;
            raf.current = requestAnimationFrame(step);
        } else raf.current = null;
    };
    return (
        <div className={`dtc-zone ${dir < 0 ? 'up' : 'down'} ${visible ? '' : 'hidden'}`}
             onDragOver={e => {
                 if (!carries(e)) return;
                 e.preventDefault();
                 e.dataTransfer.dropEffect = 'none';
                 // dragover repeats every ~50 ms while hovering; keep scrolling a bit past it.
                 until.current = performance.now() + 120;
                 if (raf.current == null) raf.current = requestAnimationFrame(step);
             }}>
            <i className={`bi ${dir < 0 ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
        </div>
    );
};

const DropToCollection = () => {
    const { tree } = useCollections();
    const [drag, setDrag] = useState(null);   // { count, kind }
    const listRef = useRef(null);
    const [edges, setEdges] = useState({ up: false, down: false });
    const measure = () => {
        const el = listRef.current;
        if (el) setEdges({ up: el.scrollTop > 2, down: el.scrollTop + el.clientHeight < el.scrollHeight - 2 });
    };
    useEffect(() => { if (drag) requestAnimationFrame(measure); }, [drag]);

    useEffect(() => {
        const start = (e) => {
            if (!carries(e)) return;
            const types = [...e.dataTransfer.types];
            // Folders: count comes from the payload only on drop — show "files" until then.
            const next = { kind: types.includes(DRAG_POSTS) ? 'posts' : 'files', count: types.includes(DRAG_POSTS) ? draggedPosts.length : null };
            // After the drag has started: changing the DOM inside dragstart can cancel it.
            setTimeout(() => setDrag(next), 0);
        };
        const end = () => setDrag(null);
        document.addEventListener('dragstart', start);
        document.addEventListener('dragend', end);
        return () => { document.removeEventListener('dragstart', start); document.removeEventListener('dragend', end); };
    }, []);

    const rows = useMemo(() => {
        const all = flatten(tree);
        const byId = new Map(all.map(n => [n.id, n]));
        const recent = loadRecentCollections().map(id => byId.get(id)).filter(Boolean).map(n => ({ ...n, depth: 0 }));
        return { all, recent };
    }, [tree, drag]);   // eslint-disable-line react-hooks/exhaustive-deps

    const onDrop = async (e, node) => {
        if (!carries(e)) return;
        e.preventDefault();
        const types = [...e.dataTransfer.types];
        const posts = types.includes(DRAG_POSTS) ? draggedPosts : null;
        const paths = !posts ? JSON.parse(e.dataTransfer.getData(DRAG_PATHS) || '[]') : null;
        setDrag(null);
        draggedPosts = [];
        pushRecentCollection(node.id);
        const target = node.id ? `«${node.name}»` : 'библиотеку';
        const res = posts ? await savePosts(posts, node.id) : await saveFiles(paths, node.id);
        notify({
            message: [
                res.ok ? `Сохранено в ${target}: ${res.ok}` : `Ничего нового для ${target}`,
                res.dup ? `уже было: ${res.dup}` : null,
                res.fail ? `ошибок: ${res.fail}` : null,
            ].filter(Boolean).join(' · '),
            type: res.fail ? 'warning' : res.ok ? 'success' : 'info',
        });
    };

    if (!drag) return null;
    return (
        <aside className="dtc-panel">
            <div className="dtc-head">
                <i className="bi bi-box-arrow-in-down" />
                <div>
                    <div className="dtc-title">Сохранить в библиотеку</div>
                    <div className="dtc-sub">
                        {drag.kind === 'posts' ? `${drag.count} ${postsWord(drag.count)} · с тегами` : 'Отпусти над коллекцией'}
                    </div>
                </div>
            </div>
            <ScrollZone dir={-1} listRef={listRef} visible={edges.up} />
            <div className="dtc-list" ref={listRef} onScroll={measure}>
                <Row node={{ id: null, name: 'Без коллекции', depth: 0 }} onDrop={onDrop} />
                {rows.recent.length > 0 && (
                    <>
                        <div className="dtc-label">Недавние</div>
                        {rows.recent.map(n => <Row key={`r-${n.id}`} node={n} onDrop={onDrop} />)}
                        <div className="dtc-label">Все коллекции</div>
                    </>
                )}
                {rows.all.map(n => <Row key={n.id} node={n} onDrop={onDrop} />)}
            </div>
            <ScrollZone dir={1} listRef={listRef} visible={edges.down} />
        </aside>
    );
};

export default DropToCollection;
