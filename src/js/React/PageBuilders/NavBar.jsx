import React, {useContext, useEffect, useState} from 'react';
import {getViewPrefs, setViewPref} from '@services/viewPrefs';
import {createPortal} from 'react-dom';
import {BsSliders} from "react-icons/bs";
import ModuleRegistry from '@/ModuleRegistry';

import {GalleryContext} from '@/AppInitializer';
import {SOURCE_TYPES} from "@/Constants";
import {useLibraryContext} from '@/LibraryContext';
import {LibraryNavControls, LibraryNavSort} from '../Library/LibraryNavControls';
import TagManager from '../Settings/TagManager';
import ControlPanel from '../ControlPanel/ControlPanel';
import {openHotkeysHelp} from '../Helpers/HotkeysHelp';
import BooruSearchBar from '@modules/r34/BooruSearchBar';
import {collectionRequests, folderRequests, useCommands} from '@services/commands';
import {setTheme} from '@services/theme';
import LibraryService from '@services/LibraryService';
import {getFolderPrefs} from '@modules/folder/folderPrefs';
import {SPECIAL} from '../Library/Collection/CollectionTree';
import {useConfigVersion} from '@services/liveConfig';

const VIEW_ICONS = { 1: 'bi-grid-3x3-gap-fill', 2: 'bi-grid-1x2', 3: 'bi-columns-gap' };
const VIEW_NAMES = { 1: 'квадраты', 2: 'плитка', 3: 'колонки' };

const NavBar = () => {
    const { state, setCurrentSource, setTypeView, setSafeMode } = useContext(GalleryContext);
    const libraryCtx = useLibraryContext();

    const isLibrary = state.currentSource === SOURCE_TYPES.LIBRARY;
    const isFolder  = state.currentSource === SOURCE_TYPES.FOLDER;
    const [showPanel, setShowPanel] = useState(false);
    const [panelTab, setPanelTab] = useState('manage');
    const [panelTool, setPanelTool] = useState(null);
    const [showTags, setShowTags] = useState(false);

    const openPanel = (tab = 'manage', tool = null) => { setPanelTab(tab); setPanelTool(tool); setShowPanel(true); };

    // Favourites now live in the library sidebar (next to "Все файлы"), so the
    // top-level button is gone.
    const navButtons = [
        { label: 'Library',  type: SOURCE_TYPES.LIBRARY },
        ...ModuleRegistry.getNavItems(),
    ];

    const [activeNav, setActiveNav] = useState(0);

    // Settings saved: tabs may have appeared / disappeared. Keep the open tab
    // highlighted at its new position, or fall back to the library if it's gone.
    const configVersion = useConfigVersion();
    useEffect(() => {
        if (!configVersion) return;
        const cur = navButtons[activeNav];
        if (cur && cur.type === state.currentSource) return;
        const idx = navButtons.findIndex(b => b.type === state.currentSource);
        if (idx >= 0) setActiveNav(idx);
        else handleNavigation(0);
    }, [configVersion]);   // eslint-disable-line react-hooks/exhaustive-deps

    const handleNavigation = (idx) => {
        const btn = navButtons[idx];
        if (!btn) return;
        setActiveNav(idx);
        setViewPref('lastNav', idx);
        setCurrentSource(btn.type);
        if (btn.action) btn.action();
    };

    const navIndex = (type) => navButtons.findIndex(b => b.type === type && !b.action);

    useEffect(() => {
        const onOpen = (e) => openPanel(e.detail?.tab || 'manage', e.detail?.tool || null);
        window.addEventListener('df:openPanel', onOpen);
        return () => window.removeEventListener('df:openPanel', onOpen);
    }, []);

    useCommands('app', () => {
        const nav = navButtons.map((b, i) => ({
            id: `nav:${b.label}`, group: 'Разделы', icon: 'bi-window', title: `Перейти: ${b.label}`,
            keywords: 'раздел вкладка', run: () => handleNavigation(i),
        }));
        const tool = (id, title, icon) => ({ id: `tool:${id}`, group: 'Инструменты', icon, title, run: () => openPanel('manage', id) });
        const panel = [
            { id: 'panel:settings', group: 'Инструменты', icon: 'bi-gear', title: 'Настройки', run: () => openPanel('settings') },
            { id: 'panel:stats', group: 'Инструменты', icon: 'bi-bar-chart-line', title: 'Статистика', run: () => openPanel('stats') },
            { id: 'panel:access', group: 'Инструменты', icon: 'bi-key', title: 'Доступ: API-токены', keywords: 'расширение', run: () => openPanel('access') },
            tool('dupes', 'Поиск дубликатов', 'bi-images'),
            tool('integrity', 'Проверка целостности', 'bi-clipboard-check'),
            tool('media', 'Превью и размеры', 'bi-image'),
            tool('rules', 'Правила импорта', 'bi-magic'),
            tool('watch', 'Папки-источники', 'bi-folder-check'),
            tool('autotag', 'Автотеги (нейросеть)', 'bi-stars'),
            { id: 'panel:tags', group: 'Инструменты', icon: 'bi-tags', title: 'Управление тегами', run: () => setShowTags(true) },
            { id: 'panel:hotkeys', group: 'Инструменты', icon: 'bi-keyboard', title: 'Горячие клавиши', run: openHotkeysHelp },
        ];
        const look = [
            { id: 'theme:dark', group: 'Оформление', icon: 'bi-moon', title: 'Тема: тёмная', run: () => setTheme({ mode: 'dark' }) },
            { id: 'theme:light', group: 'Оформление', icon: 'bi-sun', title: 'Тема: светлая', run: () => setTheme({ mode: 'light' }) },
            { id: 'theme:system', group: 'Оформление', icon: 'bi-circle-half', title: 'Тема: как в системе', run: () => setTheme({ mode: 'system' }) },
            { id: 'safe', group: 'Оформление', icon: 'bi-eye-slash', title: state.safeMode ? 'Выключить безопасный режим' : 'Включить безопасный режим',
              keywords: 'размытие blur', run: () => setSafeMode(!state.safeMode) },
        ];
        // Library collections and pinned folders are reachable from any tab.
        const libIdx = navIndex(SOURCE_TYPES.LIBRARY);
        const openCollection = (id) => () => { if (libIdx >= 0) handleNavigation(libIdx); collectionRequests.request(id); };
        const special = [
            { id: SPECIAL.ALL, title: 'Все файлы', icon: 'bi-collection' },
            { id: SPECIAL.UNCATEGORIZED, title: 'Без коллекции', icon: 'bi-inbox' },
            { id: SPECIAL.HISTORY, title: 'История просмотров', icon: 'bi-clock-history' },
            { id: SPECIAL.TRASH, title: 'Корзина', icon: 'bi-trash3' },
        ].map(s => ({ id: `col:${s.id}`, group: 'Библиотека', icon: s.icon, title: s.title, run: openCollection(s.id) }));
        const cols = [];
        const walk = (nodes, trail) => nodes.forEach(n => {
            const path = [...trail, n.name];
            cols.push({
                id: `col:${n.id}`, group: 'Коллекции', icon: n.isSmart ? 'bi-funnel' : 'bi-folder',
                title: path.join(' / '), keywords: 'коллекция', run: openCollection(n.id),
            });
            walk(n.children || [], path);
        });
        walk(LibraryService.getTree(), []);
        const folderIdx = navIndex(SOURCE_TYPES.FOLDER);
        const pins = folderIdx < 0 ? [] : (getFolderPrefs().pinned || []).map(p => ({
            id: `pin:${p.path}`, group: 'Папки', icon: 'bi-pin-angle', title: p.name || p.path.split(/[\\/]/).filter(Boolean).pop(),
            hint: p.path, keywords: `папка ${p.path}`,
            run: () => { handleNavigation(folderIdx); folderRequests.request(p.path); },
        }));
        return [...nav, ...special, ...cols, ...pins, ...panel, ...look];
    });

    // Reopen the tab that was open last time (setting "Открывать там, где закрыл").
    useEffect(() => {
        const { restoreSession, lastNav } = getViewPrefs();
        if (restoreSession && lastNav > 0 && lastNav < navButtons.length) handleNavigation(lastNav);
    }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    return (
        // Glass top bar, themed like the rest of the app.
        <header className="navbar navbar-expand-lg sticky-top navbar-glass">
            <div className="container-fluid">
                <div className="navbar-nav flex-row flex-wrap">
                    <div className="btn-group nav-source-group">
                        {navButtons.map((btn, idx) => (
                            <React.Fragment key={btn.label}>
                                <input
                                    type="radio"
                                    className="btn-check"
                                    name="nav-radio"
                                    id={`nav-${idx}`}
                                    checked={activeNav === idx}
                                    readOnly
                                />
                                <label
                                    className="btn nav-source-tab"
                                    htmlFor={`nav-${idx}`}
                                    onClick={() => handleNavigation(idx)}
                                >
                                    {btn.label}
                                </label>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {isLibrary && libraryCtx ? (
                    <LibraryNavControls ctx={libraryCtx} />
                ) : isFolder ? (
                    <div className="navbar-spacer" />
                ) : (
                    <BooruSearchBar sourceType={state.currentSource} />
                )}

                {/* Right-side actions collapse into one glass "island" */}
                <div className="navbar-actions">
                    {isLibrary && libraryCtx ? (
                        <LibraryNavSort ctx={libraryCtx} />
                    ) : isFolder ? null : (
                        <>
                            <button
                                className="btn navbar-settings-btn"
                                onClick={() => setTypeView(null)}
                                title={`Вид сетки: ${VIEW_NAMES[state.typeView] || state.typeView}`}
                            >
                                <i className={`bi ${VIEW_ICONS[state.typeView] || 'bi-grid'}`} />
                            </button>
                            <button
                                className={`btn navbar-settings-btn ${state.safeMode ? 'on' : ''}`}
                                onClick={() => setSafeMode(!state.safeMode)}
                                title={state.safeMode ? 'Безопасный режим включён (размытие)' : 'Безопасный режим'}
                            >
                                <i className={`bi ${state.safeMode ? 'bi-eye-slash-fill' : 'bi-eye'}`} />
                            </button>
                        </>
                    )}

                    {isLibrary && (
                        <button
                            className="btn navbar-settings-btn"
                            onClick={() => setShowTags(true)}
                            title="Управление тегами"
                        >
                            <i className="bi bi-tags-fill" />
                        </button>
                    )}
                    <button
                        className="btn navbar-settings-btn"
                        onClick={openHotkeysHelp}
                        title="Горячие клавиши (?)"
                    >
                        <i className="bi bi-keyboard" />
                    </button>
                    <button
                        className="btn navbar-settings-btn"
                        onClick={() => openPanel(isLibrary ? 'manage' : 'settings')}
                        title="Панель управления"
                    >
                        <BsSliders />
                    </button>
                </div>
            </div>

            {/* Portalled to body: the glass navbar's backdrop-filter would otherwise
                make these fixed overlays position against the navbar box, not the viewport. */}
            {showPanel && createPortal(
                <ControlPanel initialTab={panelTab} initialTool={panelTool} onClose={() => setShowPanel(false)} />,
                document.body,
            )}
            {showTags && createPortal(
                <TagManager onClose={() => setShowTags(false)} />,
                document.body,
            )}
        </header>
    );
};

export default NavBar;