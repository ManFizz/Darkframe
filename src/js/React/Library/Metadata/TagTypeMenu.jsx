import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import LibraryService from '@services/LibraryService';
import {TAG_TYPES} from '@/shared/tagTypes';
import {notify} from '@services/NotificationService';

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

function TagTypeMenu({menu, onClose}) {
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
            else setError('Сначала добавьте файл с этим тегом в библиотеку');
        }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; };
    }, [menu.name]);
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
            notify({ message: `Тип тега «${tag.name}» изменён`, type: 'success' });
            onClose();
        } catch (e) { setError(e.message); setBusy(false); }
    };
    return createPortal(<div ref={ref} className="tm-type-menu" role="menu" aria-label="Изменить тип тега" style={{left: menu.x, top: menu.y}} onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
        <div className="tm-type-menu-title">Тип «{menu.name}»</div>
        {error && <div role="alert" className="tm-type-menu-title">{error}</div>}
        {!tag && !error && <div className="tm-type-menu-title">Загрузка…</div>}
        <button role="menuitem" disabled={!tag || busy} onClick={() => choose(null)}>Как на сайте / не задан</button>
        {Object.entries(TAG_TYPES).map(([value, label]) => <button role="menuitemradio" aria-checked={String(tag?.type) === value} disabled={!tag || busy} key={value} className={String(tag?.type) === value ? 'active' : ''} onClick={() => choose(Number(value))}>{label}</button>)}
    </div>, document.body);
}
