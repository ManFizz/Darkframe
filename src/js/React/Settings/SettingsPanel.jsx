import React, {useEffect, useState} from 'react';
import {configApi} from '@/Infrastructure/Ipc';
import AppearanceSection from './AppearanceSection';

const SECRET_RE = /key|password|token/i;

// Human labels + descriptions. Unknown keys fall back to the raw key, no desc.
// Remote-section toggles, split out of the generic "settings" into their own card.
const MODULE_KEYS = ['EnableR34', 'EnableGelbooru', 'EnableR34Favs', 'EnableDanbooru'];

const META = {
    modules: {
        EnableR34:      { label: 'Rule34',   desc: 'Показывать раздел rule34.xxx' },
        EnableGelbooru: { label: 'Gelbooru', desc: 'Показывать раздел gelbooru.com' },
        EnableR34Favs:  { label: 'R34 Favs', desc: 'Показывать раздел избранного rule34.xxx' },
        EnableDanbooru: { label: 'Danbooru', desc: 'Показывать раздел danbooru.donmai.us' },
    },
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
        RealBooruId: { label: 'RealBooru ID',     desc: 'Идентификатор пользователя RealBooru' },
        R34ApiKey:   { label: 'Rule34 API Key',   desc: 'Ключ API для rule34.xxx' },
        R34UserId:   { label: 'Rule34 User ID',   desc: 'Идентификатор пользователя rule34.xxx' },
        GelbooruApiKey: { label: 'Gelbooru API Key', desc: 'Ключ API для gelbooru.com (Настройки аккаунта → API Access)' },
        GelbooruUserId: { label: 'Gelbooru User ID', desc: 'Идентификатор пользователя gelbooru.com' },
        DanbooruLogin:  { label: 'Danbooru логин',   desc: 'Необязательно: без аккаунта поиск ограничен двумя тегами' },
        DanbooruApiKey: { label: 'Danbooru API Key', desc: 'Профиль → API Key на danbooru.donmai.us' },
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

// `keys` optionally restricts which fields render; onChange still merges back into
// the full `value`, so a filtered section never drops the hidden keys.
const Section = ({ icon, title, value, meta, keys, onChange }) => (
    <div className="settings-section">
        <div className="settings-section-title">
            <i className={`bi ${icon} me-2`} />
            {title}
        </div>
        <div className="settings-section-body">
            {(keys ?? Object.keys(value)).map(key => (
                <FieldRow
                    key={key}
                    name={key}
                    value={value[key]}
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
            .then(({ settings, private: p }) => {
                // Sections added later still get a switch in older settings files.
                setSettings({ EnableDanbooru: false, ...settings });
                // Keys added after a user's data/private.js was created still get a field.
                setPriv({ GelbooruApiKey: '', GelbooruUserId: '', DanbooruLogin: '', DanbooruApiKey: '', ...p });
            })
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

    // Hide a section's credentials while that section is disabled. rule34's key/id
    // back both the R34 and R34 Favs sections, so either one keeps them visible.
    const r34On = !!(settings?.EnableR34 || settings?.EnableR34Favs);
    const gelOn = !!settings?.EnableGelbooru;
    const danOn = !!settings?.EnableDanbooru;
    const privateKeys = priv
        ? Object.keys(priv).filter(k =>
            !((k === 'R34ApiKey' || k === 'R34UserId') && !r34On) &&
            !((k === 'GelbooruApiKey' || k === 'GelbooruUserId') && !gelOn) &&
            !((k === 'DanbooruLogin' || k === 'DanbooruApiKey') && !danOn))
        : [];

    // Rendered as a tab inside the Control Panel: no overlay/header of its own,
    // just the settings body + a save/relaunch footer.
    return (
        <>
            <div className="settings-body">
                <AppearanceSection />
                {loading ? (
                    <div className="settings-loading">
                        <i className="bi bi-arrow-repeat spin me-2" />Загрузка…
                    </div>
                ) : (
                    <>
                        <Section
                            icon="bi-grid" title="Разделы"
                            value={settings} meta={META.modules}
                            keys={MODULE_KEYS.filter(k => k in settings)}
                            onChange={setSettings}
                        />
                        <Section
                            icon="bi-sliders" title="Общие"
                            value={settings} meta={META.settings}
                            keys={Object.keys(settings).filter(k => !MODULE_KEYS.includes(k))}
                            onChange={setSettings}
                        />
                        <Section
                            icon="bi-shield-lock" title="Приватные"
                            value={priv} meta={META.private}
                            keys={privateKeys}
                            onChange={setPriv}
                        />
                    </>
                )}
            </div>

            <div className="settings-footer">
                {error && <span className="settings-error">{error}</span>}
                <button className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={saving}>
                    Закрыть
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={loading || saving}>
                    {saving
                        ? <><i className="bi bi-arrow-repeat spin me-1" />Перезапуск…</>
                        : <><i className="bi bi-check2 me-1" />Сохранить и перезапустить</>}
                </button>
            </div>
        </>
    );
};

export default SettingsPanel;
