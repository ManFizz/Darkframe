import ModuleRegistry from '@/ModuleRegistry';
import {SOURCE_TYPES} from '@/Constants';
import Settings from '@data/settings';
import {updateR34Source} from './R34Controller';
import {DisplayRemoteFavoriteR34, StopR34Loading} from './R34FavoriteController';
import SectionR34 from './SectionR34';

// Read on every render of the top bar, so switching a section on / off in the
// settings shows or hides its tab right away.
function navItems() {
    const items = [];
    if (Settings.EnableR34)      items.push({label: 'R34',      type: SOURCE_TYPES.R34});
    if (Settings.EnableGelbooru) items.push({label: 'Gelbooru', type: SOURCE_TYPES.GELBOORU});
    if (Settings.EnableR34Favs)  items.push({label: 'R34 Favs', type: SOURCE_TYPES.R34, action: DisplayRemoteFavoriteR34});
    if (Settings.EnableDanbooru) items.push({label: 'Danbooru', type: SOURCE_TYPES.DANBOORU});
    return items;
}

ModuleRegistry.register({
    sourceTypes: [SOURCE_TYPES.R34, SOURCE_TYPES.GELBOORU, SOURCE_TYPES.REALBOORU, SOURCE_TYPES.DANBOORU],

    get navItems() { return navItems(); },

    sidebarSection: SectionR34,

    onSourceChange(sourceType) {
        StopR34Loading();
        updateR34Source(sourceType);
    },
});
