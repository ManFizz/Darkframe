import React, {useEffect, useMemo, useRef, useState} from 'react';

// "D:\Media\Photos" → [{ label: 'D:', path: 'D:\' }, { label: 'Media', path: 'D:\Media' }, …]
export function crumbsOf(p) {
    if (!p) return [];
    const sep = p.includes('\\') ? '\\' : '/';
    const parts = p.split(/[\\/]/).filter(Boolean);
    const out = [];
    let acc = p.startsWith('/') ? '/' : '';
    parts.forEach((part, i) => {
        if (i === 0 && /^[a-z]:$/i.test(part)) acc = part + sep;
        else acc = acc && !acc.endsWith(sep) ? acc + sep + part : acc + part;
        out.push({ label: part, path: acc });
    });
    return out;
}

// Breadcrumbs that turn into an editable path on click (or Ctrl+L). Long paths
// collapse their middle segments into "…".
const PathBar = ({ path, onOpen, editSignal }) => {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(path || '');
    const inputRef = useRef(null);

    useEffect(() => { setValue(path || ''); setEditing(false); }, [path]);
    useEffect(() => { if (editSignal) setEditing(true); }, [editSignal]);
    useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

    const crumbs = useMemo(() => crumbsOf(path), [path]);
    const shown = crumbs.length > 5 ? [crumbs[0], null, ...crumbs.slice(-3)] : crumbs;

    if (editing) {
        return (
            <div className="pathbar editing">
                <i aria-hidden="true" className="bi bi-folder2-open" />
                <input
                    ref={inputRef}
                    value={value}
                    spellCheck={false}
                    onChange={e => setValue(e.target.value)}
                    onBlur={() => setEditing(false)}
                    onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter') { setEditing(false); onOpen(value.trim().replace(/^"|"$/g, '')); }
                        if (e.key === 'Escape') { setEditing(false); setValue(path || ''); }
                    }}
                />
            </div>
        );
    }

    return (
        <div className="pathbar" onClick={() => setEditing(true)} title="Нажми, чтобы ввести путь (Ctrl+L)">
            <i aria-hidden="true" className="bi bi-hdd" />
            {shown.map((c, i) => c ? (
                <React.Fragment key={c.path}>
                    {i > 0 && <i aria-hidden="true" className="bi bi-chevron-right pathbar-sep" />}
                    <button
                        className={`pathbar-crumb ${i === shown.length - 1 ? 'current' : ''}`}
                        onClick={e => { e.stopPropagation(); onOpen(c.path); }}
                    >
                        {c.label}
                    </button>
                </React.Fragment>
            ) : (
                <React.Fragment key="gap">
                    <i aria-hidden="true" className="bi bi-chevron-right pathbar-sep" />
                    <span className="pathbar-gap">…</span>
                </React.Fragment>
            ))}
        </div>
    );
};

export default PathBar;
