import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {HOTKEY_GROUPS, currentHotkeyContext} from '@/shared/hotkeys';
import {bindingsOf, keyCaps} from '@services/keymap';

// Caps for a sheet row: the user's current bindings when it's a remappable action
// (alternatives separated by "/"), the static list otherwise.
function capsOf(it) {
    if (!it.action) return it.keys;
    const lists = Array.isArray(it.action)
        ? it.action.map(a => bindingsOf(a).slice(0, 1))        // pair: first binding of each
        : [bindingsOf(it.action)];
    const bindings = lists.flat();
    if (!bindings.length) return ['—'];
    return bindings.flatMap((b, i) => (i ? ['/', ...keyCaps(b)] : keyCaps(b)));
}
import {matches} from '@services/keymap';

export const OPEN_HOTKEYS_EVENT = 'df:hotkeys';
export const openHotkeysHelp = () => window.dispatchEvent(new CustomEvent(OPEN_HOTKEYS_EVENT));

const typing = () => {
    const el = document.activeElement;
    return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
};

// Keyboard cheat sheet. Opens with "?" anywhere (or openHotkeysHelp()); the group for
// the current context (gallery / viewer / video / editor) comes first. While open it
// swallows the keyboard so nothing behind it reacts.
const HotkeysHelp = () => {
    const [context, setContext] = useState(null);   // null = closed

    useEffect(() => {
        const open = () => setContext(currentHotkeyContext());
        const onKey = (e) => {
            if (matches(e, 'app.help') && !typing()) {
                e.preventDefault();
                e.stopPropagation();
                setContext(c => (c ? null : currentHotkeyContext()));
            }
        };
        // window + capture: runs before every document-level shortcut handler.
        window.addEventListener(OPEN_HOTKEYS_EVENT, open);
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener(OPEN_HOTKEYS_EVENT, open);
            window.removeEventListener('keydown', onKey, true);
        };
    }, []);

    // While open: Esc closes, every other key is kept from the page underneath.
    useEffect(() => {
        if (!context) return;
        const onKey = (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); setContext(null); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [context]);

    if (!context) return null;

    const groups = [...HOTKEY_GROUPS].sort((a, b) => (b.id === context) - (a.id === context));

    return createPortal(
        <div className="settings-overlay" onMouseDown={() => setContext(null)}>
            <div className="settings-modal hotkeys-modal" onMouseDown={e => e.stopPropagation()}>
                <div className="settings-header">
                    <i aria-hidden="true" className="bi bi-keyboard me-2" />
                    <span>Горячие клавиши</span>
                    <button className="settings-close" onClick={() => setContext(null)} title="Закрыть (Esc)">
                        <i aria-hidden="true" className="bi bi-x-lg" />
                    </button>
                </div>
                <div className="settings-body hotkeys-body">
                    {groups.map(g => (
                        <section key={g.id} className={`hotkeys-group ${g.id === context ? 'current' : ''}`}>
                            <h3>
                                <i aria-hidden="true" className={`bi ${g.icon}`} /> {g.title}
                                {g.id === context && <span className="hotkeys-now">сейчас</span>}
                            </h3>
                            {g.items.map((it, i) => (
                                <div key={i} className="hotkeys-row">
                                    <span className="hotkeys-keys">
                                        {capsOf(it).map((k, j) => (k === '/'
                                            ? <span key={j} className="hotkeys-or">/</span>
                                            : <kbd key={j}>{k}</kbd>))}
                                    </span>
                                    <span className="hotkeys-desc">{it.desc}</span>
                                </div>
                            ))}
                        </section>
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default HotkeysHelp;
