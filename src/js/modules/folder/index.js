import ModuleRegistry from '@/ModuleRegistry';
import {SOURCE_TYPES} from '@/Constants';
import {displayImagesByPath} from './FolderController';
import PrivateData from '@data/private';

ModuleRegistry.register({
    sourceTypes: [SOURCE_TYPES.FOLDER],

    navItems: [
        {label: 'Folders', type: SOURCE_TYPES.FOLDER, action: () => displayImagesByPath(PrivateData.startPath)},
    ],

    sidebarSection: null,

    onSourceChange() {},
});
