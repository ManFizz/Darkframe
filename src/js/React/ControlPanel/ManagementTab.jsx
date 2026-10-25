import React, {useState} from 'react';
import {isWeb} from '@/Infrastructure/electron';
import DuplicatesTab from './DuplicatesTab';
import IntegrityTool from './IntegrityTool';
import MediaGenTool from './MediaGenTool';
import AutoRulesTool from './AutoRulesTool';
import WatchFoldersTool from './WatchFoldersTool';
import AutotagTool from './AutotagTool';
import FolderAuditTool from './FolderAuditTool';

const TOOLS = [
    { id: 'dupes',     label: 'Дубликаты',       icon: 'bi-images' },
    { id: 'integrity', label: 'Целостность',      icon: 'bi-clipboard-check' },
    { id: 'media',     label: 'Превью и размеры', icon: 'bi-image' },
    { id: 'rules',     label: 'Правила импорта',  icon: 'bi-magic' },
    { id: 'watch',     label: 'Папки-источники',  icon: 'bi-folder-check' },
    { id: 'autotag',   label: 'Автотеги',         icon: 'bi-stars' },
    { id: 'audit',     label: 'Проверка папки',   icon: 'bi-folder-symlink' },
];

// The management tab groups the maintenance tools behind a sub-tab bar; each tool
// owns its own scrolling body.
const ManagementTab = ({ initialTool }) => {
    const [tool, setTool] = useState(initialTool || 'dupes');

    return (
        <>
            <div className="cp-subtabs">
                {TOOLS.filter(t => !isWeb || (t.id !== 'watch' && t.id !== 'autotag' && t.id !== 'audit')).map(t => (
                    <button
                        key={t.id}
                        className={`cp-subtab ${tool === t.id ? 'active' : ''}`}
                        onClick={() => setTool(t.id)}
                    >
                        <i className={`bi ${t.icon} me-1`} />
                        {t.label}
                    </button>
                ))}
            </div>

            {tool === 'dupes'     && <DuplicatesTab />}
            {tool === 'integrity' && <IntegrityTool />}
            {tool === 'media'     && <MediaGenTool />}
            {tool === 'rules'     && <AutoRulesTool />}
            {tool === 'watch'     && <WatchFoldersTool />}
            {tool === 'autotag'   && <AutotagTool />}
            {tool === 'audit'     && <FolderAuditTool />}
        </>
    );
};

export default ManagementTab;
