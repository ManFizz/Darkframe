import React, {useState} from 'react';
import DuplicatesTab from './DuplicatesTab';
import IntegrityTool from './IntegrityTool';
import MediaGenTool from './MediaGenTool';

const TOOLS = [
    { id: 'dupes',     label: 'Дубликаты',       icon: 'bi-images' },
    { id: 'integrity', label: 'Целостность',      icon: 'bi-clipboard-check' },
    { id: 'media',     label: 'Превью и размеры', icon: 'bi-image' },
];

// The management tab groups the maintenance tools behind a sub-tab bar; each tool
// owns its own scrolling body.
const ManagementTab = () => {
    const [tool, setTool] = useState('dupes');

    return (
        <>
            <div className="cp-subtabs">
                {TOOLS.map(t => (
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
        </>
    );
};

export default ManagementTab;
