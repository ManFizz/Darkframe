import React, {useContext, useEffect, useRef, useState} from 'react';
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
import {collectionRequests, folderRequests, mangaRequests, useCommands} from '@services/commands';
import {openManga} from '@modules/manga/openManga';
import {isWeb} from '@/Infrastructure/electron';
import {useOpenModel} from '../Models/modelsState';
import {MoreMenu, SiteSwitcher} from './NavMenus';
import {installApp, toggleFullscreen, usePwa} from '@services/pwa';

const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
import {setTheme} from '@services/theme';
import {notify} from '@services/NotificationService';
import LibraryService from '@services/LibraryService';
import {getFolderPrefs} from '@modules/folder/folderPrefs';
import {SPECIAL} from '../Library/Collection/CollectionTree';
import {useConfigVersion} from '@services/liveConfig';

// Tabs grouped into islands: the library, the booru sites, local folders + manga.
const NAV_TYPE_ICON = {
    [SOURCE_TYPES.LIBRARY]: 'bi-collection', [SOURCE_TYPES.MODELS]: 'bi-people', [SOURCE_TYPES.FOLDER]: 'bi-folder2', [SOURCE_TYPES.MANGA]: 'bi-book',
};
const NAV_ICON = { 'R34 Favs': 'bi-heart' };
const sectionOf = (btn) => ([SOURCE_TYPES.LIBRARY, SOURCE_TYPES.MODELS].includes(btn.type) ? 'library'
    : btn.type === SOURCE_TYPES.FOLDER || btn.type === SOURCE_TYPES.MANGA ? 'local' : 'boorus');
const SECTION_TITLE = { library: 'Библиотека', boorus: 'Сайты', local: 'Папки и манга' };

const VIEW_ICONS = { 1: 'bi-grid-3x3-gap-fill', 2: 'bi-grid-1x2', 3: 'bi-columns-gap' };
const VIEW_NAMES = { 1: 'квадраты', 2: 'плитка', 3: 'колонки' };

const NavBar = () => {
    const { state, setCurrentSource, setTypeView, setSafeMode } = useContext(GalleryContext);
    const libraryCtx = useLibraryContext();
    const pwa = usePwa();

    // An open model is a library view: same search, sort and tags in the bar.
    const openModel = useOpenModel();
    const isLibrary = state.currentSource === SOURCE_TYPES.LIBRARY
        || (state.currentSource === SOURCE_TYPES.MODELS && !!openModel);
    const isFolder  = state.currentSource === SOURCE_TYPES.FOLDER;
    const isManga   = state.currentSource === SOURCE_TYPES.MANGA;
    const isModelList = state.currentSource === SOURCE_TYPES.MODELS && !openModel;   // own search in the view
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
        // Last in the list (tabs are remembered by position), shown in the library island.
        { label: 'Модели', type: SOURCE_TYPES.MODELS },
    ];

    const [activeNav, setActiveNav] = useState(0);
    const navSections = ['library', 'boorus', 'local']
        .map(id => ({ id, title: SECTION_TITLE[id], items: navButtons.map((btn, idx) => ({ btn, idx })).filter(x => sectionOf(x.btn) === id) }))
        .filter(sec => sec.items.length);

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
        if (sectionOf(btn) === 'boorus') setViewPref('lastBooru', idx);
        setCurrentSource(btn.type);
        if (btn.action) btn.action();
    };

    const navIndex = (type) => navButtons.findIndex(b => b.type === type && !b.action);

    // openManga(): switch to the Manga tab, then hand the request to the view.
    const navRef = useRef(null);
    navRef.current = { navIndex: (t) => navButtons.findIndex(b => b.type === t && !b.action), handleNavigation };
    useEffect(() => {
        const onOpen = (e) => {
            const i = navRef.current.navIndex(SOURCE_TYPES.MANGA);
            if (i < 0) { notify({ message: 'Раздел «Манга» выключен в настройках', type: 'info' }); return; }
            navRef.current.handleNavigation(i);
            mangaRequests.request(e.detail || {});
        };
        window.addEventListener('df:openManga', onOpen);
        return () => window.removeEventListener('df:openManga', onOpen);
    }, []);

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
            { id: 'panel:devices', group: 'Инструменты', icon: 'bi-phone', title: 'Телефон: подключить устройство', keywords: 'мобильный сеть wifi qr планшет', run: () => openPanel('devices') },
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
        const manga = navIndex(SOURCE_TYPES.MANGA) < 0 ? [] : [
            { id: 'manga:downloads', group: 'Манга', icon: 'bi-download', title: 'Манга: загрузки', keywords: 'очередь скачать', run: () => openManga({ view: 'downloads' }) },
            { id: 'manga:recent', group: 'Манга', icon: 'bi-clock-history', title: 'Манга: продолжить чтение', keywords: 'история', run: () => openManga({ view: 'recent' }) },
        ];
        // On a phone the PC's settings / tokens / devices / tools stay on the PC.
        const PC_ONLY = ['panel:settings', 'panel:access', 'panel:devices', 'tool:watch', 'tool:autotag'];
        return [...nav, ...special, ...cols, ...pins, ...manga, ...(isWeb ? panel.filter(c => !PC_ONLY.includes(c.id)) : panel), ...look];
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
                <div className="navbar-nav flex-row nav-sections">
                    {navSections.map(sec => (sec.id === 'boorus' && sec.items.length > 1 ? (
                        <div key={sec.id} className={`nav-island nav-island--${sec.id}`}>
                            <SiteSwitcher items={sec.items} activeIdx={activeNav} lastIdx={getViewPrefs().lastBooru}
                                          onGo={handleNavigation} icon={(btn) => NAV_ICON[btn.label] || NAV_TYPE_ICON[btn.type] || 'bi-globe2'} />
                        </div>
                    ) : (
                        <div key={sec.id} className={`nav-island nav-island--${sec.id}`} title={sec.title}>
                            {sec.items.map(({ btn, idx }) => (
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
                                        <i className={`bi ${NAV_ICON[btn.label] || NAV_TYPE_ICON[btn.type] || 'bi-globe2'}`} />
                                        <span>{btn.label}</span>
                                    </label>
                                </React.Fragment>
                            ))}
                        </div>
                    )))}
                </div>

                {isLibrary && libraryCtx ? (
                    <LibraryNavControls ctx={libraryCtx} />
                ) : isFolder || isManga || isModelList ? (
                    <div className="navbar-spacer" />
                ) : (
                    <BooruSearchBar sourceType={state.currentSource} />
                )}

                {/* Right-side actions collapse into one glass "island" */}
                <div className="navbar-actions">
                    {isLibrary && libraryCtx ? (
                        <LibraryNavSort ctx={libraryCtx} />
                    ) : isFolder || isModelList ? null : isManga ? (
                        <button
                            className={`btn navbar-settings-btn ${state.safeMode ? 'on' : ''}`}
                            onClick={() => setSafeMode(!state.safeMode)}
                            title={state.safeMode ? 'Безопасный режим включён (размытие)' : 'Безопасный режим'}
                        >
                            <i className={`bi ${state.safeMode ? 'bi-eye-slash-fill' : 'bi-eye'}`} />
                        </button>
                    ) : (
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

                    {pwa.installable && (
                        <button className="btn navbar-settings-btn on" onClick={() => installApp()} title="Установить как приложение">
                            <i className="bi bi-download" />
                        </button>
                    )}
                    {/* Phone in a browser tab: full screen instead of the hotkeys. */}
                    {isWeb && touch ? (pwa.canFullscreen && !pwa.standalone && (
                        <button className="btn navbar-settings-btn" onClick={toggleFullscreen} title={pwa.fullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}>
                            <i className={`bi ${pwa.fullscreen ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}`} />
                        </button>
                    )) : null}
                    {/* Used now and then: one menu instead of a button each. */}
                    <MoreMenu items={[
                        isLibrary && { id: 'slideshow', icon: 'bi-play-circle', label: 'Слайд-шоу', hint: 'S',
                            run: () => window.dispatchEvent(new CustomEvent('df:slideshow')) },
                        isLibrary && { id: 'tags', icon: 'bi-tags', label: 'Управление тегами', run: () => setShowTags(true) },
                        !isLibrary && !isFolder && !isManga && !isModelList && { id: 'safe', icon: state.safeMode ? 'bi-eye' : 'bi-eye-slash',
                            label: state.safeMode ? 'Выключить безопасный режим' : 'Безопасный режим', run: () => setSafeMode(!state.safeMode) },
                        { id: 'palette', icon: 'bi-search', label: 'Команды и переходы', hint: 'Ctrl+K',
                            run: () => window.dispatchEvent(new CustomEvent('df:openPalette')) },
                        !(isWeb && touch) && { id: 'hotkeys', icon: 'bi-keyboard', label: 'Горячие клавиши', hint: '?', run: openHotkeysHelp },
                    ]} />
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
