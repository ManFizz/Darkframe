import ModuleRegistry from '@/ModuleRegistry';
import {SOURCE_TYPES} from '@/Constants';
import {updateR34Source} from './R34Controller';
import {DisplayRemoteFavoriteR34, StopR34Loading} from './R34FavoriteController';
import SectionR34 from './SectionR34';

ModuleRegistry.register({
    sourceTypes: [SOURCE_TYPES.R34, SOURCE_TYPES.GELBOORU, SOURCE_TYPES.REALBOORU],

    navItems: [
        {label: 'R34',      type: SOURCE_TYPES.R34},
        {label: 'Gelbooru', type: SOURCE_TYPES.GELBOORU},
        {label: 'R34 Favs', type: SOURCE_TYPES.R34, action: DisplayRemoteFavoriteR34},
    ],

    sidebarSection: SectionR34,

    onSourceChange(sourceType) {
        StopR34Loading();
        updateR34Source(sourceType);
    },
});
