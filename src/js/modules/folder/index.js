import ModuleRegistry from '@/ModuleRegistry';
import {SOURCE_TYPES} from '@/Constants';

// The Folders browser is a self-contained view (FolderView), rendered by the app shell.
ModuleRegistry.register({
    sourceTypes: [SOURCE_TYPES.FOLDER],

    navItems: [
        {label: 'Folders', type: SOURCE_TYPES.FOLDER},
    ],

    sidebarSection: null,

    onSourceChange() {},
});
