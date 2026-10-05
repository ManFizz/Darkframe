import React, {useState} from 'react';
import SettingsPanel from '../Settings/SettingsPanel';
import Dashboard from '../Dashboard/Dashboard';
import ManagementTab from './ManagementTab';
import ApiTokensTab from './ApiTokensTab';
import DevicesTab from './DevicesTab';
import {isWeb} from '@/Infrastructure/electron';

const TABS = [
    { id: 'manage',   label: 'Управление', icon: 'bi-wrench-adjustable' },
    { id: 'stats',    label: 'Статистика', icon: 'bi-bar-chart-line-fill' },
    { id: 'access',   label: 'Доступ',     icon: 'bi-key-fill' },
    { id: 'devices',  label: 'Устройства', icon: 'bi-phone' },
    { id: 'settings', label: 'Настройки',  icon: 'bi-gear-fill' },
];

// Unified "Панель управления": Управление (maintenance — duplicate finder),
// Статистика (dashboard) and Настройки, each an in-place tab of one modal.
const ControlPanel = ({ onClose, initialTab = 'manage', initialTool = null }) => {
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
                    {/* On a phone the PC's settings, tokens and devices stay on the PC. */}
                    {TABS.filter(t => !isWeb || t.id === 'manage' || t.id === 'stats').map(t => (
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
                {tab === 'manage'   && <ManagementTab initialTool={initialTool} />}
                {tab === 'stats'    && <Dashboard />}
                {tab === 'access'   && !isWeb && <ApiTokensTab />}
                {tab === 'devices'  && !isWeb && <DevicesTab />}
                {tab === 'settings' && !isWeb && <SettingsPanel onClose={onClose} />}
            </div>
        </div>
    );
};

export default ControlPanel;
