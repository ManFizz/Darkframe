import ModuleRegistry from '@/ModuleRegistry';
import {SOURCE_TYPES} from '@/Constants';
import Settings from '@data/settings';

// Online manga: a self-contained view (MangaView), rendered by the app shell.
// On unless switched off in the settings.
ModuleRegistry.register({
    sourceTypes: [SOURCE_TYPES.MANGA],

    get navItems() {
        return Settings.EnableManga === false ? [] : [{label: 'Manga', type: SOURCE_TYPES.MANGA}];
    },

    sidebarSection: null,

    onSourceChange() {},
});
