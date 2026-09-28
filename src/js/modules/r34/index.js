import ModuleRegistry from '@/ModuleRegistry';
import {SOURCE_TYPES} from '@/Constants';
import Settings from '@data/settings';
import {updateR34Source} from './R34Controller';
import {DisplayRemoteFavoriteR34, StopR34Loading} from './R34FavoriteController';
import SectionR34 from './SectionR34';

const navItems = [];
if (Settings.EnableR34)      navItems.push({label: 'R34',      type: SOURCE_TYPES.R34});
if (Settings.EnableGelbooru) navItems.push({label: 'Gelbooru', type: SOURCE_TYPES.GELBOORU});
if (Settings.EnableR34Favs)  navItems.push({label: 'R34 Favs', type: SOURCE_TYPES.R34, action: DisplayRemoteFavoriteR34});
if (Settings.EnableDanbooru) navItems.push({label: 'Danbooru', type: SOURCE_TYPES.DANBOORU});

ModuleRegistry.register({
    sourceTypes: [SOURCE_TYPES.R34, SOURCE_TYPES.GELBOORU, SOURCE_TYPES.REALBOORU, SOURCE_TYPES.DANBOORU],

    navItems,

    sidebarSection: SectionR34,

    onSourceChange(sourceType) {
        StopR34Loading();
        updateR34Source(sourceType);
    },
});
