import ModuleRegistry from '@/ModuleRegistry';
import {SOURCE_TYPES} from '@/Constants';
import {isWeb} from '@/Infrastructure/electron';

// The Folders browser is a self-contained view (FolderView), rendered by the app shell.
ModuleRegistry.register({
    sourceTypes: [SOURCE_TYPES.FOLDER],

    // The PC's disks stay on the PC: no Folders tab on a phone.
    navItems: isWeb ? [] : [
        {label: 'Folders', type: SOURCE_TYPES.FOLDER},
    ],

    sidebarSection: null,

    onSourceChange() {},
});
