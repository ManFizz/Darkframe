import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import LibraryService from '@services/LibraryService';
import {TAG_TYPE_CHOICES, tagTypeLabel} from '@/shared/tagTypes';
import {notify} from '@services/NotificationService';

/**
 * Right click on a tag → its category: "Модель", "Автор", "Персонаж"… The choice
 * is the user's (Tags.userType) and wins over the site's; "Как на сайте" drops it.
 *
 *   const { onTagContextMenu, tagTypeMenu } = useTagTypeMenu();
 *   <span onContextMenu={e => onTagContextMenu(e, name)}>…</span>
 *   {tagTypeMenu}
 */
export function useTagTypeMenu() {
    const [menu, setMenu] = useState(null);
    return {
        onTagContextMenu: (event, name) => {
            event.preventDefault();
            event.stopPropagation();
            setMenu({ name, x: event.clientX, y: event.clientY });
        },
        tagTypeMenu: menu ? <TagTypeMenu key={`${menu.name}:${menu.x}:${menu.y}`} menu={menu} onClose={() => setMenu(null)} /> : null,
    };
}

function TagTypeMenu({ menu, onClose }) {
    const ref = useRef(null);
    const [tag, setTag] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        LibraryService.getAllTags().then(tags => {
            if (!active) return;
            const found = tags.find(t => t.name === menu.name);
            if (found) setTag(found);
            else setError('Тега нет в библиотеке — сначала добавьте файл с ним');
        }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; };
    }, [menu.name]);
    // Stays on screen near the pointer.
    useLayoutEffect(() => {
        const el = ref.current;
        const box = el.getBoundingClientRect();
        el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8))}px`;
        el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - box.height - 8))}px`;
    });
    useEffect(() => {
        const outside = e => { if (!ref.current?.contains(e.target)) onClose(); };
        const key = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        document.addEventListener('mousedown', outside, true);
        document.addEventListener('keydown', key, true);
        window.addEventListener('resize', onClose);
        return () => {
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('keydown', key, true);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose]);
    const choose = async type => {
        setBusy(true);
        try {
            await LibraryService.setTagType([tag.id], type);
            notify({ message: type == null ? `«${tag.name}»: тип как на сайте` : `«${tag.name}» — ${tagTypeLabel(type).toLowerCase()}`, type: 'success' });
            onClose();
        } catch (e) { setError(e.message); setBusy(false); }
    };
    const manual = tag?.userType != null;
    return createPortal(
        <div ref={ref} className="tm-type-menu" role="menu" aria-label="Тип тега" style={{ left: menu.x, top: menu.y }}
             onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
            <div className="tm-type-menu-head">
                <span className="tm-type-menu-name" title={menu.name}>{menu.name}</span>
                {tag && <span className="tm-type-menu-now">{tagTypeLabel(tag.type)}{manual ? ' · вручную' : ''}</span>}
            </div>
            {error && <div role="alert" className="tm-type-menu-note err">{error}</div>}
            {!tag && !error && <div className="tm-type-menu-note"><i className="bi bi-arrow-repeat spin" /> Загрузка…</div>}
            {TAG_TYPE_CHOICES.map(({ id, label }) => {
                const on = tag?.type === id;
                return (
                    <button role="menuitemradio" aria-checked={on} disabled={!tag || busy} key={id} className={on ? 'active' : ''} onClick={() => choose(id)}>
                        <span className={`tag-dot tag-type-${id}`} />
                        <span className="tm-type-menu-label">{label}</span>
                        {on && <i className="bi bi-check2" />}
                    </button>
                );
            })}
            {manual && (
                <button role="menuitem" disabled={busy} className="tm-type-menu-reset" onClick={() => choose(null)}>
                    <i className="bi bi-arrow-counterclockwise" />
                    <span className="tm-type-menu-label">Как на сайте</span>
                </button>
            )}
        </div>,
        document.body,
    );
}
