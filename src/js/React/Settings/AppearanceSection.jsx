import React from 'react';
import {ACCENT_PRESETS, useTheme} from '@services/theme';

const MODES = [
    { id: 'dark',   label: 'Тёмная',    icon: 'bi-moon-stars' },
    { id: 'light',  label: 'Светлая',   icon: 'bi-sun' },
    { id: 'system', label: 'Как в ОС',  icon: 'bi-circle-half' },
];

// Colour mode + accent. Applied instantly (no "save & relaunch" needed).
const AppearanceSection = () => {
    const [theme, setTheme] = useTheme();
    const isPreset = ACCENT_PRESETS.some(p => p.value.toLowerCase() === String(theme.accent).toLowerCase());

    return (
        <div className="settings-section">
            <div className="settings-section-title">
                <i className="bi bi-palette me-2" />
                Оформление
                <span className="appearance-live">применяется сразу</span>
            </div>
            <div className="settings-section-body">
                <div className="settings-item settings-item--inline">
                    <div className="settings-item-info">
                        <div className="settings-item-label">Тема</div>
                        <div className="settings-item-desc">Просмотрщик и верхняя панель остаются тёмными в любой теме</div>
                    </div>
                    <div className="appearance-modes">
                        {MODES.map(m => (
                            <button
                                key={m.id}
                                className={theme.mode === m.id ? 'active' : ''}
                                onClick={() => setTheme({ mode: m.id })}
                            >
                                <i className={`bi ${m.icon}`} /> {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="settings-item settings-item--stacked">
                    <div className="settings-item-info">
                        <div className="settings-item-label">Акцентный цвет</div>
                    </div>
                    <div className="appearance-swatches">
                        {ACCENT_PRESETS.map(p => (
                            <button
                                key={p.value}
                                className={`appearance-swatch ${p.value.toLowerCase() === String(theme.accent).toLowerCase() ? 'active' : ''}`}
                                style={{ background: p.value }}
                                title={p.name}
                                onClick={() => setTheme({ accent: p.value })}
                            />
                        ))}
                        <label
                            className={`appearance-swatch appearance-custom ${!isPreset ? 'active' : ''}`}
                            title="Свой цвет"
                            style={!isPreset ? { background: theme.accent } : undefined}
                        >
                            <i className="bi bi-eyedropper" />
                            <input
                                type="color"
                                value={theme.accent}
                                onChange={e => setTheme({ accent: e.target.value })}
                            />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppearanceSection;
