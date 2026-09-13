import React, {useState} from 'react';
import SettingsPanel from '../Settings/SettingsPanel';
import Dashboard from '../Dashboard/Dashboard';
import ManagementTab from './ManagementTab';

const TABS = [
    { id: 'manage',   label: 'Управление', icon: 'bi-wrench-adjustable' },
    { id: 'stats',    label: 'Статистика', icon: 'bi-bar-chart-line-fill' },
    { id: 'settings', label: 'Настройки',  icon: 'bi-gear-fill' },
];

// Unified "Панель управления": Управление (maintenance — duplicate finder),
// Статистика (dashboard) and Настройки, each an in-place tab of one modal.
const ControlPanel = ({ onClose, initialTab = 'manage' }) => {
    const [tab, setTab] = useState(initialTab);

    return (
        <div className="settings-overlay" onMouseDown={onClose}>
            <div className="settings-modal control-panel" onMouseDown={e => e.stopPropagation()}>
                <div className="settings-header">
                    <i className="bi bi-sliders me-2" />
                    <span>Панель управления</span>
                    <button className="settings-close" onClick={onClose} title="Закрыть">
                        <i className="bi bi-x-lg" />
                    </button>
                </div>

                <div className="cp-tabs">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            className={`cp-tab ${tab === t.id ? 'active' : ''}`}
                            onClick={() => setTab(t.id)}
                        >
                            <i className={`bi ${t.icon} me-1`} />
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Each tab owns its own scrolling body (and, for settings, a footer). */}
                {tab === 'manage'   && <ManagementTab />}
                {tab === 'stats'    && <Dashboard />}
                {tab === 'settings' && <SettingsPanel onClose={onClose} />}
            </div>
        </div>
    );
};

export default ControlPanel;
