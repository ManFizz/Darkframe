import React, {useEffect, useState} from 'react';
import {configApi} from '@/Infrastructure/Ipc';

const SECRET_RE = /key|password|token/i;

// Human labels + descriptions. Unknown keys fall back to the raw key, no desc.
const META = {
    settings: {
        SafeView:         { label: 'Безопасный просмотр',     desc: 'Скрывать чувствительный контент по умолчанию' },
        MaxThumbsPerPage: { label: 'Превью на страницу',      desc: 'Сколько миниатюр подгружать за раз' },
        Resize:           { label: 'Сжимать превью',          desc: 'Уменьшать изображения для галереи (экономия памяти)' },
        LongView:         { label: 'Режим длинных картинок',  desc: 'Особый показ очень высоких изображений в модалке' },
        HttpProxy:        { label: 'Использовать прокси',      desc: 'Проксировать запросы к удалённым источникам' },
        LibraryPath:      { label: 'Путь библиотеки (legacy)', desc: 'Папка старой библиотеки по умолчанию' },
    },
    private: {
        startPath:   { label: 'Стартовая папка',  desc: 'С какой папки открывается файловый источник' },
        P365UserId:  { label: 'Porno365 User ID', desc: 'Идентификатор пользователя porno365' },
        RealBooruId: { label: 'RealBooru ID',     desc: 'Идентификатор пользователя RealBooru' },
        R34ApiKey:   { label: 'Rule34 API Key',   desc: 'Ключ API для rule34.xxx' },
        R34UserId:   { label: 'Rule34 User ID',   desc: 'Идентификатор пользователя rule34.xxx' },
        HttpProxy:   {
            label: 'HTTP-прокси', desc: 'Параметры прокси-сервера',
            children: {
                ip:       { label: 'IP-адрес' },
                port:     { label: 'Порт' },
                login:    { label: 'Логин' },
                password: { label: 'Пароль' },
            },
        },
    },
};

const FieldRow = ({ name, value, meta = {}, onChange }) => {
    const label = meta.label || name;
    const desc  = meta.desc;

    // Boolean → switch (inline)
    if (typeof value === 'boolean') {
        return (
            <div className="settings-item settings-item--inline">
                <div className="settings-item-info">
                    <div className="settings-item-label">{label}</div>
                    {desc && <div className="settings-item-desc">{desc}</div>}
                </div>
                <div className="form-check form-switch settings-switch">
                    <input
                        className="form-check-input"
                        type="checkbox"
                        checked={value}
                        onChange={e => onChange(e.target.checked)}
                    />
                </div>
            </div>
        );
    }

    // Number → small input (inline)
    if (typeof value === 'number') {
        return (
            <div className="settings-item settings-item--inline">
                <div className="settings-item-info">
                    <div className="settings-item-label">{label}</div>
                    {desc && <div className="settings-item-desc">{desc}</div>}
                </div>
                <input
                    type="number"
                    className="form-control form-control-sm settings-num"
                    value={value}
                    onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                />
            </div>
        );
    }

    // Nested object → sub-card
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return (
            <div className="settings-item settings-item--group">
                <div className="settings-item-label">{label}</div>
                {desc && <div className="settings-item-desc">{desc}</div>}
                <div className="settings-subgroup">
                    {Object.entries(value).map(([k, v]) => (
                        <FieldRow
                            key={k}
                            name={k}
                            value={v}
                            meta={meta.children?.[k] || {}}
                            onChange={nv => onChange({ ...value, [k]: nv })}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // String → stacked full-width
    return (
        <div className="settings-item settings-item--stacked">
            <div className="settings-item-info">
                <div className="settings-item-label">{label}</div>
                {desc && <div className="settings-item-desc">{desc}</div>}
            </div>
            <input
                type="text"
                spellCheck={false}
                className={`form-control form-control-sm ${SECRET_RE.test(name) ? 'settings-secret' : ''}`}
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
            />
        </div>
    );
};

const Section = ({ icon, title, value, meta, onChange }) => (
    <div className="settings-section">
        <div className="settings-section-title">
            <i className={`bi ${icon} me-2`} />
            {title}
        </div>
        <div className="settings-section-body">
            {Object.entries(value).map(([key, val]) => (
                <FieldRow
                    key={key}
                    name={key}
                    value={val}
                    meta={meta[key] || {}}
                    onChange={nv => onChange({ ...value, [key]: nv })}
                />
            ))}
        </div>
    </div>
);

const SettingsPanel = ({ onClose }) => {
    const [settings, setSettings] = useState(null);
    const [priv, setPriv]         = useState(null);
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState(null);

    useEffect(() => {
        configApi.get()
            .then(({ settings, private: p }) => { setSettings(settings); setPriv(p); })
            .catch(e => setError(e.message));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await configApi.save({ settings, private: priv });
            await configApi.relaunch();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    };

    const loading = !settings || !priv;

    return (
        <div className="settings-overlay" onMouseDown={onClose}>
            <div className="settings-modal" onMouseDown={e => e.stopPropagation()}>
                <div className="settings-header">
                    <i className="bi bi-gear-fill me-2" />
                    <span>Настройки</span>
                    <button className="settings-close" onClick={onClose} title="Закрыть">
                        <i className="bi bi-x-lg" />
                    </button>
                </div>

                <div className="settings-body">
                    {loading ? (
                        <div className="settings-loading">
                            <i className="bi bi-arrow-repeat spin me-2" />Загрузка…
                        </div>
                    ) : (
                        <>
                            <Section
                                icon="bi-sliders" title="Общие"
                                value={settings} meta={META.settings} onChange={setSettings}
                            />
                            <Section
                                icon="bi-shield-lock" title="Приватные"
                                value={priv} meta={META.private} onChange={setPriv}
                            />
                        </>
                    )}
                </div>

                <div className="settings-footer">
                    {error && <span className="settings-error">{error}</span>}
                    <button className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={saving}>
                        Отмена
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={loading || saving}>
                        {saving
                            ? <><i className="bi bi-arrow-repeat spin me-1" />Перезапуск…</>
                            : <><i className="bi bi-check2 me-1" />Сохранить и перезапустить</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;
