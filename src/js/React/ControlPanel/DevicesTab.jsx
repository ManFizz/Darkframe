import React, {useCallback, useEffect, useState} from 'react';
import {remoteApi} from '@/Infrastructure/Ipc';
import {notify} from '@services/NotificationService';

const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const fmtAgo = (t) => {
    if (!t) return '—';
    const s = Math.floor(Date.now() / 1000) - t;
    if (s < 90) return 'только что';
    if (s < 3600) return `${Math.round(s / 60)} мин назад`;
    if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
    return new Date(t * 1000).toLocaleDateString('ru-RU');
};

// How to put the library on the phone's home screen as an app.
const AppInstallHelp = ({ urls }) => {
    const [open, setOpen] = useState(false);
    const lan = urls.filter(u => !u.virtual);
    const origin = (lan[0] || urls[0])?.url;
    const copy = (text) => navigator.clipboard?.writeText(text).then(() => notify({ message: 'Скопировано', type: 'info' }));
    return (
        <div className="rm-app">
            <button className="cp-linkbtn" onClick={() => setOpen(v => !v)}>
                <i aria-hidden="true" className={`bi bi-chevron-${open ? 'down' : 'right'} me-1`} />Как приложение на телефоне: своя иконка, во весь экран
            </button>
            {open && (
                <div className="rm-app-body">
                    <div className="rm-app-os">
                        <b><i aria-hidden="true" className="bi bi-apple" /> iPhone / iPad</b>
                        <ol>
                            <li>Подключите устройство по QR-коду и откройте библиотеку в Safari.</li>
                            <li>«Поделиться» → «На экран Домой».</li>
                        </ol>
                        <span className="rm-hint">Откроется со своей иконкой, без адресной строки.</span>
                    </div>
                    <div className="rm-app-os">
                        <b><i aria-hidden="true" className="bi bi-android2" /> Android (Chrome)</b>
                        <span className="rm-hint">
                            Chrome ставит приложения только с защищённых (https) адресов. Домашний адрес компьютера нужно один раз отметить как доверенный:
                        </span>
                        <ol>
                            <li>
                                В Chrome на телефоне откройте <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>
                                <button className="cp-linkbtn" onClick={() => copy('chrome://flags/#unsafely-treat-insecure-origin-as-secure')}>копировать</button>
                            </li>
                            <li>
                                Впишите адрес <code>{origin}</code>
                                <button className="cp-linkbtn" onClick={() => copy(origin)}>копировать</button>,
                                выберите «Enabled» и нажмите «Relaunch».
                            </li>
                            <li>Откройте библиотеку: вверху появится кнопка <i aria-hidden="true" className="bi bi-download" /> «Установить» (или меню Chrome → «Установить приложение»).</li>
                        </ol>
                        <span className="rm-hint">
                            Без этого «Добавить на главный экран» даёт ярлык, который открывается во вкладке; кнопка <i aria-hidden="true" className="bi bi-arrows-fullscreen" /> вверху разворачивает на весь экран.
                            Если адрес компьютера в сети меняется, закрепите его в настройках роутера.
                        </span>
                    </div>
                    <span className="rm-hint">Установленное на Android приложение, когда компьютер выключен, покажет «Компьютер недоступен» и откроется само, как только он появится.</span>
                </div>
            )}
        </div>
    );
};

/**
 * Phone / tablet / another computer's browser over the home network: switch the
 * server on, pair a device with a QR code, limit or revoke devices.
 */
const DevicesTab = () => {
    const [st, setSt] = useState(null);
    const [port, setPort] = useState('');
    const [busy, setBusy] = useState(false);
    const [pairing, setPairing] = useState(null);   // { links, expiresAt, access }
    const [access, setAccess] = useState('full');
    const [linkIdx, setLinkIdx] = useState(0);
    const [, tick] = useState(0);

    const reload = useCallback(async () => {
        const s = await remoteApi.status();
        setSt(s);
        setPort(p => p || String(s.port));
    }, []);
    useEffect(() => { reload(); const t = setInterval(reload, 5000); return () => clearInterval(t); }, [reload]);
    useEffect(() => { if (!pairing) return; const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, [pairing]);

    const run = async (fn) => {
        setBusy(true);
        try { await fn(); } catch (e) { notify({ message: errText(e), type: 'warning' }); } finally { setBusy(false); }
    };

    const toggle = (enabled) => run(async () => {
        const s = await remoteApi.setSettings({ enabled, port: Number(port) || undefined });
        setSt(s);
        if (!enabled) setPairing(null);
        if (enabled && s.error) notify({ message: s.error, type: 'warning' });
    });
    const applyPort = () => run(async () => setSt(await remoteApi.setSettings({ port: Number(port) })));

    const startPairing = () => run(async () => {
        const r = await remoteApi.createCode({ access });
        setPairing({ ...r, access, expiresAt: Date.now() + r.expiresIn * 1000 });
        setLinkIdx(0);
    });

    const left = pairing ? Math.max(0, Math.round((pairing.expiresAt - Date.now()) / 1000)) : 0;
    const link = pairing?.links[linkIdx];

    return (
        <div className="settings-body cp-manage">
            <div className="cp-manage-head">
                <div>
                    <h3>Телефон и другие устройства</h3>
                    <p className="cp-manage-desc">
                        Библиотека, просмотр и манга в браузере телефона или планшета по домашней сети. Всё остаётся на этом компьютере —
                        он должен быть включён, а Darkframe запущен (можно свёрнутым в трей).
                    </p>
                </div>
            </div>

            {st && (
                <div className="apitok-master rm-master">
                    <label className="apitok-switch">
                        <input type="checkbox" checked={st.enabled} disabled={busy} onChange={e => toggle(e.target.checked)} />
                        <span>Доступ из сети</span>
                    </label>
                    <span className={`apitok-status ${st.running ? 'on' : 'off'}`}>
                        {st.running ? `Работает · порт ${st.runningPort}` : st.error ? st.error : 'Выключен'}
                    </span>
                    <span className="rm-port">
                        Порт
                        <input className="form-control form-control-sm" value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))} />
                        {st.enabled && Number(port) !== st.port && <button className="btn btn-sm btn-outline-secondary" onClick={applyPort} disabled={busy}>Применить</button>}
                    </span>
                </div>
            )}

            {st?.running && (
                <div className="rm-pair">
                    {!pairing ? (
                        <div className="rm-pair-start">
                            <select className="form-select form-select-sm" value={access} onChange={e => setAccess(e.target.value)}>
                                <option value="full">Полный доступ</option>
                                <option value="view">Только просмотр</option>
                            </select>
                            <button className="btn btn-sm btn-primary" onClick={startPairing} disabled={busy}>
                                <i aria-hidden="true" className="bi bi-qr-code me-1" />Подключить устройство
                            </button>
                            <span className="rm-hint">
                                Телефон должен быть в той же Wi-Fi сети. Откроется QR-код — наведите на него камеру телефона.
                            </span>
                        </div>
                    ) : left > 0 ? (
                        <div className="rm-qr-box">
                            <div className="rm-qr" dangerouslySetInnerHTML={{ __html: link.qr }} />
                            <div className="rm-qr-info">
                                <b>Отсканируйте камерой телефона</b>
                                <span>или откройте ссылку в его браузере:</span>
                                <code className="rm-link">{link.link}</code>
                                {pairing.links.length > 1 && (
                                    <label className="rm-addr">
                                        Адрес компьютера:
                                        <select className="form-select form-select-sm" value={linkIdx} onChange={e => setLinkIdx(Number(e.target.value))}>
                                            {pairing.links.map((l, i) => <option key={l.address} value={i}>{l.address} · {l.name}{l.virtual ? ' (виртуальный)' : ''}</option>)}
                                        </select>
                                    </label>
                                )}
                                <span className="rm-hint">
                                    {pairing.access === 'view' ? 'Только просмотр' : 'Полный доступ'} · код одноразовый, действует ещё {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                                </span>
                                <span className="rm-hint">После подключения: в меню браузера «Добавить на главный экран» — будет как приложение.</span>
                                <button className="cp-linkbtn" onClick={() => setPairing(null)}>Готово</button>
                            </div>
                        </div>
                    ) : (
                        <div className="rm-pair-start">
                            <span className="rm-hint">Код истёк.</span>
                            <button className="btn btn-sm btn-primary" onClick={startPairing} disabled={busy}>Новый код</button>
                        </div>
                    )}
                </div>
            )}

            {st?.routeWarning && (
                <div className="rm-warn">
                    <i aria-hidden="true" className="bi bi-exclamation-triangle-fill" />
                    <div>
                        <b>Телефон может не подключиться: «{st.routeWarning.adapter}» перехватывает домашнюю сеть.</b>
                        <span>
                            Ответы на {st.routeWarning.count} адрес(ов) домашней сети уходят в этот VPN / прокси-туннель вместо «{st.routeWarning.lanAdapter}» —
                            если среди них адрес телефона, он не дождётся ответа. Полностью закройте эту программу (или выключите в ней режим TUN),
                            либо включите в ней обход локальной сети («Bypass LAN», исключение 192.168.0.0/16).
                        </span>
                    </div>
                </div>
            )}
            {st?.running && <AppInstallHelp urls={st.urls} />}

            {st && (
                <div className="apitok-list">
                    {!st.devices.length && (
                        <div className="cp-empty">
                            <i aria-hidden="true" className="bi bi-phone" />
                            <span>Подключённых устройств пока нет</span>
                        </div>
                    )}
                    {st.devices.map(d => (
                        <div key={d.id} className="apitok-row">
                            <div className="apitok-row-main">
                                <i aria-hidden="true" className={`bi ${/iphone|android|pixel|galaxy|xiaomi|redmi/i.test(d.name + d.agent) ? 'bi-phone' : /ipad|tablet/i.test(d.name + d.agent) ? 'bi-tablet' : 'bi-laptop'}`} />
                                <input className="form-control form-control-sm rm-name" defaultValue={d.name}
                                       onBlur={e => { if (e.target.value.trim() && e.target.value !== d.name) run(async () => { await remoteApi.updateDevice(d.id, { name: e.target.value.trim() }); await reload(); }); }} />
                                {st.connected.includes(d.id) && <span className="rm-online" title="Сейчас подключено">в сети</span>}
                            </div>
                            <div className="apitok-row-meta">
                                <span>подключено: {fmtAgo(d.createdAt)}</span>
                                <span>последний раз: {fmtAgo(d.lastSeenAt)}</span>
                            </div>
                            <div className="apitok-row-actions">
                                <select className="form-select form-select-sm" value={d.access}
                                        onChange={e => run(async () => { await remoteApi.updateDevice(d.id, { access: e.target.value }); await reload(); })}>
                                    <option value="full">Полный доступ</option>
                                    <option value="view">Только просмотр</option>
                                </select>
                                <button className="btn btn-sm btn-outline-danger" title="Отключить устройство"
                                        onClick={() => { if (confirm(`Отключить «${d.name}»? Ему придётся подключаться заново по QR-коду.`)) run(async () => { await remoteApi.revoke(d.id); await reload(); }); }}>
                                    <i aria-hidden="true" className="bi bi-trash3" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DevicesTab;
