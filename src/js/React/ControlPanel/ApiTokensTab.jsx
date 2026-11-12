import React, {useCallback, useEffect, useState} from 'react';
import {apiTokensApi} from '@/Infrastructure/Ipc';
import {notify} from '@services/NotificationService';

const fmtDate = (t) => (t ? new Date(t * 1000).toLocaleString('ru-RU') : '—');

// GitHub-PAT style management for the local API (127.0.0.1:45678): per-extension
// tokens, each scoped to a subset of endpoints. No accounts — the token is the key.
const ApiTokensTab = () => {
    const [config, setConfig]   = useState(null);   // { requireAuth, scopes:[{id,label}] }
    const [tokens, setTokens]   = useState([]);
    const [newName, setNewName] = useState('');
    const [newScopes, setNewScopes] = useState(new Set());
    const [created, setCreated] = useState(null);    // { token, info } shown once
    const [busy, setBusy]       = useState(false);

    const reload = useCallback(async () => {
        const [cfg, list] = await Promise.all([apiTokensApi.config(), apiTokensApi.list()]);
        setConfig(cfg);
        setTokens(list);
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const toggleRequireAuth = useCallback(async (value) => {
        await apiTokensApi.setRequireAuth(value);
        await reload();
    }, [reload]);

    const toggleScope = useCallback((id) => {
        setNewScopes(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const createToken = useCallback(async () => {
        if (!newName.trim() || !newScopes.size || busy) return;
        setBusy(true);
        try {
            const res = await apiTokensApi.create({ name: newName.trim(), scopes: [...newScopes] });
            setCreated(res);
            setNewName('');
            setNewScopes(new Set());
            await reload();
        } catch (e) {
            notify({ message: `Не удалось: ${e.message}`, type: 'danger' });
        } finally {
            setBusy(false);
        }
    }, [newName, newScopes, busy, reload]);

    const revoke = useCallback(async (id, name) => {
        if (!confirm(`Отозвать токен «${name}»? Расширение с ним потеряет доступ.`)) return;
        await apiTokensApi.revoke(id);
        await reload();
    }, [reload]);

    const setEnabled = useCallback(async (id, enabled) => {
        await apiTokensApi.setEnabled(id, enabled);
        await reload();
    }, [reload]);

    const copy = useCallback((text) => {
        navigator.clipboard.writeText(text).catch(() => {});
        notify({ message: 'Токен скопирован', type: 'success', duration: 1500 });
    }, []);

    const scopeLabel = (id) => config?.scopes.find(s => s.id === id)?.label || id;

    return (
        <div className="settings-body cp-manage">
            <div className="cp-manage-head">
                <div>
                    <h3>API-токены</h3>
                    <p className="cp-manage-desc">
                        Доступ к локальному API (127.0.0.1:45678) для расширений. У каждого — свой токен и свои права.
                    </p>
                </div>
            </div>

            {config && (
                <div className="apitok-master">
                    <label className="apitok-switch">
                        <input
                            type="checkbox"
                            checked={config.requireAuth}
                            onChange={e => toggleRequireAuth(e.target.checked)}
                        />
                        <span>Требовать токен</span>
                    </label>
                    <span className={`apitok-status ${config.requireAuth ? 'on' : 'off'}`}>
                        {config.requireAuth
                            ? 'API закрыт: запросы без валидного токена отклоняются'
                            : 'API открыт для любого приложения — небезопасно'}
                    </span>
                </div>
            )}

            {/* Freshly created token — shown exactly once */}
            {created && (
                <div className="apitok-new">
                    <div className="apitok-new-head">
                        <i aria-hidden="true" className="bi bi-key-fill me-1" />
                        Токен «{created.info.name}» создан. Скопируй его — больше он не покажется.
                    </div>
                    <div className="apitok-new-value">
                        <code>{created.token}</code>
                        <button className="btn btn-sm btn-primary" onClick={() => copy(created.token)}>
                            <i aria-hidden="true" className="bi bi-clipboard me-1" />Копировать
                        </button>
                    </div>
                    <button className="cp-linkbtn" onClick={() => setCreated(null)}>Скрыть</button>
                </div>
            )}

            {/* Create form */}
            {config && (
                <div className="apitok-create">
                    <div className="apitok-create-row">
                        <input
                            className="form-control form-control-sm"
                            placeholder="Название (например, «Tampermonkey»)"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                        />
                        <button
                            className="btn btn-sm btn-primary"
                            onClick={createToken}
                            disabled={busy || !newName.trim() || !newScopes.size}
                        >
                            <i aria-hidden="true" className="bi bi-plus-lg me-1" />Создать
                        </button>
                    </div>
                    <div className="apitok-scopes">
                        {config.scopes.map(s => (
                            <label key={s.id} className="apitok-scope">
                                <input
                                    type="checkbox"
                                    checked={newScopes.has(s.id)}
                                    onChange={() => toggleScope(s.id)}
                                />
                                <span>{s.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Token list */}
            <div className="apitok-list">
                {tokens.length === 0 && (
                    <div className="cp-empty">
                        <i aria-hidden="true" className="bi bi-key" />
                        <span>Токенов пока нет</span>
                    </div>
                )}
                {tokens.map(t => (
                    <div key={t.id} className={`apitok-row ${t.enabled ? '' : 'disabled'}`}>
                        <div className="apitok-row-main">
                            <span className="apitok-name">{t.name}</span>
                            <code className="apitok-prefix">{t.prefix}</code>
                            <div className="apitok-chips">
                                {t.scopes.length
                                    ? t.scopes.map(s => <span key={s} className="apitok-chip" title={scopeLabel(s)}>{s}</span>)
                                    : <span className="apitok-chip apitok-chip--none">без прав</span>}
                            </div>
                        </div>
                        <div className="apitok-row-meta">
                            <span>создан: {fmtDate(t.createdAt)}</span>
                            <span>использован: {fmtDate(t.lastUsedAt)}</span>
                        </div>
                        <div className="apitok-row-actions">
                            <button
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => setEnabled(t.id, !t.enabled)}
                                title={t.enabled ? 'Отключить' : 'Включить'}
                            >
                                <i aria-hidden="true" className={`bi ${t.enabled ? 'bi-pause' : 'bi-play'}`} />
                            </button>
                            <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => revoke(t.id, t.name)}
                                title="Отозвать"
                            >
                                <i aria-hidden="true" className="bi bi-trash3" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ApiTokensTab;
