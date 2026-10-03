import {useEffect, useState} from 'react';

/**
 * Remappable keyboard shortcuts. Each action has default bindings; the user can
 * reassign them in Settings → «Горячие клавиши» (stored per viewer). Handlers ask
 * `matches(e, 'viewer.slideshow')` instead of testing key codes themselves.
 *
 * A binding is "Ctrl+Shift+KeyN" style: modifiers in a fixed order + KeyboardEvent.code
 * (layout-independent: the same physical key in any keyboard layout).
 * Arrows, Esc, Enter, Delete and the rating digits are fixed on purpose.
 */
export const ACTIONS = [
    { id: 'app.palette',       group: 'Общее',     label: 'Палитра команд',                 keys: ['Ctrl+KeyK'] },
    // "?" is Shift+/ on an English layout and Shift+7 on a Russian one.
    { id: 'app.help',          group: 'Общее',     label: 'Шпаргалка по клавишам',          keys: ['Shift+Slash', 'Shift+Digit7'] },
    { id: 'common.selectAll',  group: 'Общее',     label: 'Выделить всё',                    keys: ['Ctrl+KeyA'] },
    { id: 'lib.invert',        group: 'Библиотека', label: 'Инвертировать выделение',        keys: ['Ctrl+KeyI'] },
    { id: 'lib.undo',          group: 'Библиотека', label: 'Отменить',                        keys: ['Ctrl+KeyZ'] },
    { id: 'lib.redo',          group: 'Библиотека', label: 'Повторить',                       keys: ['Ctrl+KeyY', 'Ctrl+Shift+KeyZ'] },
    { id: 'lib.paste',         group: 'Библиотека', label: 'Вставить из буфера в коллекцию', keys: ['Ctrl+KeyV'] },
    { id: 'viewer.slideshow',  group: 'Просмотр',  label: 'Слайд-шоу: запустить / пауза',   keys: ['KeyS'] },
    { id: 'viewer.filmstrip',  group: 'Просмотр',  label: 'Полоса миниатюр',                keys: ['KeyT'] },
    { id: 'media.frameBack',   group: 'Видео и анимация', label: 'Кадр назад',                keys: ['Comma'] },
    { id: 'media.frameFwd',    group: 'Видео и анимация', label: 'Кадр вперёд',               keys: ['Period'] },
    { id: 'video.slower',      group: 'Видео и анимация', label: 'Медленнее',                 keys: ['Shift+Comma'] },
    { id: 'video.faster',      group: 'Видео и анимация', label: 'Быстрее',                   keys: ['Shift+Period'] },
    { id: 'video.mute',        group: 'Видео и анимация', label: 'Без звука',                 keys: ['KeyM'] },
    { id: 'video.fullscreen',  group: 'Видео и анимация', label: 'Во весь экран',             keys: ['KeyF'] },
    { id: 'video.pip',         group: 'Видео и анимация', label: 'Картинка в картинке',       keys: ['KeyP'] },
    { id: 'fs.rename',         group: 'Папки',     label: 'Переименовать',                  keys: ['F2'] },
    { id: 'fs.refresh',        group: 'Папки',     label: 'Обновить папку',                 keys: ['F5'] },
    { id: 'fs.newFolder',      group: 'Папки',     label: 'Новая папка',                    keys: ['Ctrl+Shift+KeyN'] },
    { id: 'fs.path',           group: 'Папки',     label: 'Ввести путь',                    keys: ['Ctrl+KeyL'] },
    { id: 'fs.filter',         group: 'Папки',     label: 'Фильтр по имени',                keys: ['Ctrl+KeyF'] },
    { id: 'reader.mode',       group: 'Читалка манги', label: 'Режим: страница / разворот / лента', keys: ['KeyV'] },
    { id: 'reader.direction',  group: 'Читалка манги', label: 'Направление: справа налево / слева направо', keys: ['KeyD'] },
    { id: 'reader.fit',        group: 'Читалка манги', label: 'Подгонка: по высоте / ширине / целиком', keys: ['KeyW'] },
    { id: 'reader.thumbs',     group: 'Читалка манги', label: 'Миниатюры страниц',                keys: ['KeyG'] },
    { id: 'reader.fullscreen', group: 'Читалка манги', label: 'Во весь экран',                    keys: ['KeyF'] },
    { id: 'reader.autoscroll', group: 'Читалка манги', label: 'Лента: автопрокрутка',              keys: ['KeyA'] },
    { id: 'reader.nextChapter', group: 'Читалка манги', label: 'Следующая глава',                 keys: ['BracketRight'] },
    { id: 'reader.prevChapter', group: 'Читалка манги', label: 'Предыдущая глава',                keys: ['BracketLeft'] },
    { id: 'reader.savePage',   group: 'Читалка манги', label: 'Сохранить страницу в библиотеку', keys: ['KeyS'] },
];
const BY_ID = new Map(ACTIONS.map(a => [a.id, a]));

const KEY = 'jsg_keymap';
let overrides = load();   // id → [binding]
const listeners = new Set();

function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function save() {
    try { localStorage.setItem(KEY, JSON.stringify(overrides)); } catch { /* ignore */ }
    listeners.forEach(fn => fn());
}

export const bindingsOf = (id) => overrides[id] || BY_ID.get(id)?.keys || [];

// Event → binding string ("" for a lone modifier press).
export function comboOf(e) {
    if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return '';
    const mods = [];
    if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    return [...mods, e.code].join('+');
}

export function matches(e, id) {
    const combo = comboOf(e);
    return !!combo && bindingsOf(id).includes(combo);
}

// Where an action works: keys only clash inside one place (or with app-wide ones) —
// F can be "fullscreen" both in the video player and in the manga reader.
const SCOPES = { app: 'global', common: 'global', lib: 'library', viewer: 'viewer', media: 'viewer', video: 'viewer', fs: 'folders', reader: 'reader' };
const scopeOf = (id) => SCOPES[id.split('.')[0]] || 'global';

// Which action (other than `except`) already uses a binding where `except` works.
export const conflictOf = (binding, except) => {
    const scope = except ? scopeOf(except) : 'global';
    return ACTIONS.find(a => a.id !== except && bindingsOf(a.id).includes(binding)
        && (scope === 'global' || scopeOf(a.id) === 'global' || scopeOf(a.id) === scope)) || null;
};

export function setBinding(id, binding, { replaceIndex = 0 } = {}) {
    const clash = conflictOf(binding, id);
    if (clash) overrides[clash.id] = bindingsOf(clash.id).filter(b => b !== binding);   // taken over
    const cur = [...bindingsOf(id)];
    cur[replaceIndex] = binding;
    overrides[id] = [...new Set(cur.filter(Boolean))];
    save();
    return clash;
}

export function clearBinding(id, index) {
    overrides[id] = bindingsOf(id).filter((_, i) => i !== index);
    save();
}

export function resetBinding(id) { delete overrides[id]; save(); }
export function resetAll() { overrides = {}; save(); }
export const isCustom = (id) => !!overrides[id];

// "Ctrl+Shift+KeyN" → ["Ctrl", "Shift", "N"] for key caps.
const NAMES = {
    Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[',
    BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Space: 'Пробел', Tab: 'Tab',
};
export function keyCaps(binding) {
    return binding.split('+').map(p => NAMES[p] || p.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num '));
}
export const label = (binding) => keyCaps(binding).join(' + ');

export function useKeymap() {
    const [, bump] = useState(0);
    useEffect(() => {
        const fn = () => bump(v => v + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);
    return { bindingsOf, isCustom };
}
