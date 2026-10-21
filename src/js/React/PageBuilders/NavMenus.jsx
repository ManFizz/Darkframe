import React, {useEffect, useRef, useState} from 'react';

// A small menu under a top-bar button; closes on a click outside / Esc.
function usePopover() {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', esc, true);
        return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
    }, [open]);
    return { open, setOpen, ref };
}

/**
 * The booru sites as one tab: it shows the site that's open (or the last one
 * used), a click on it opens that site, the arrow lists the others. Four tabs of
 * look-alike globe icons become one that says which site it is.
 *
 * items: [{ btn: { label, type }, idx }]; icon(btn) → bootstrap icon class.
 */
export const SiteSwitcher = ({ items, activeIdx, lastIdx, onGo, icon }) => {
    const { open, setOpen, ref } = usePopover();
    const active = items.find(x => x.idx === activeIdx);
    const shown = active || items.find(x => x.idx === lastIdx) || items[0];
    const go = (idx) => { setOpen(false); onGo(idx); };
    return (
        <div className={`nav-site ${active ? 'active' : ''}`} ref={ref}>
            <button className="btn nav-source-tab nav-site-main" title={active ? `${shown.btn.label} — другие сайты в списке` : `Открыть ${shown.btn.label}`}
                    onClick={() => (active ? setOpen(v => !v) : go(shown.idx))}>
                <i className={`bi ${icon(shown.btn)}`} />
                <span>{shown.btn.label}</span>
            </button>
            <button className="btn nav-source-tab nav-site-caret" title="Сайты" onClick={() => setOpen(v => !v)}>
                <i className={`bi bi-chevron-${open ? 'up' : 'down'}`} />
            </button>
            {open && (
                <div className="nav-pop nav-site-menu" role="menu">
                    <div className="nav-pop-title">Сайты</div>
                    {items.map(({ btn, idx }) => (
                        <button key={idx} role="menuitemradio" aria-checked={idx === activeIdx}
                                className={idx === activeIdx ? 'on' : ''} onClick={() => go(idx)}>
                            <i className={`bi ${icon(btn)}`} />
                            <span>{btn.label}</span>
                            {idx === activeIdx && <i className="bi bi-check2 nav-pop-check" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * "⋯": what's used now and then (slideshow, the tag manager, hotkeys…) instead of
 * a button each. items: [{ id, icon, label, hint?, run }] (falsy entries skipped).
 */
export const MoreMenu = ({ items }) => {
    const { open, setOpen, ref } = usePopover();
    const list = items.filter(Boolean);
    if (!list.length) return null;
    return (
        <div className="nav-more" ref={ref}>
            <button className={`btn navbar-settings-btn ${open ? 'active' : ''}`} onClick={() => setOpen(v => !v)} title="Ещё">
                <i className="bi bi-three-dots" />
            </button>
            {open && (
                <div className="nav-pop nav-more-menu" role="menu">
                    {list.map(it => (
                        <button key={it.id} role="menuitem" onClick={() => { setOpen(false); it.run(); }}>
                            <i className={`bi ${it.icon}`} />
                            <span>{it.label}</span>
                            {it.hint && <kbd>{it.hint}</kbd>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
