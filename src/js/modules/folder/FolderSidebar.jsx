import React, {useEffect, useMemo, useState} from 'react';
import {fsApi} from '@/Infrastructure/Ipc';
import PrivateData from '@data/private';
import {baseName, forgetRecent, togglePin, useFolderPrefs} from './folderPrefs';

const os = window.require('os');
const fs = window.require('fs');
const nodePath = window.require('path');

const fmtGB = (b) => (b >= 1024 ** 4 ? `${(b / 1024 ** 4).toFixed(1)} ТБ` : `${Math.round(b / 1024 ** 3)} ГБ`);

// Well-known folders that actually exist on this machine (+ the configured start path).
function quickAccess() {
    const home = os.homedir();
    const list = [
        PrivateData.startPath && { path: PrivateData.startPath, name: 'Стартовая папка', icon: 'bi-house-door' },
        { path: nodePath.join(home, 'Desktop'),   name: 'Рабочий стол', icon: 'bi-display' },
        { path: nodePath.join(home, 'Pictures'),  name: 'Изображения',  icon: 'bi-images' },
        { path: nodePath.join(home, 'Videos'),    name: 'Видео',        icon: 'bi-film' },
        { path: nodePath.join(home, 'Downloads'), name: 'Загрузки',     icon: 'bi-download' },
    ].filter(Boolean);
    return list.filter(q => { try { return fs.statSync(q.path).isDirectory(); } catch { return false; } });
}

const same = (a, b) => !!a && !!b && a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();

const Item = ({ icon, label, sub, active, onClick, onRemove, removeTitle, children }) => (
    <div className={`fsb-item ${active ? 'active' : ''}`} onClick={onClick} title={sub || label}>
        <i className={`bi ${icon}`} />
        <span className="fsb-label">{label}</span>
        {children}
        {onRemove && (
            <button
                className="fsb-remove"
                title={removeTitle}
                onClick={e => { e.stopPropagation(); onRemove(); }}
            >
                <i className="bi bi-x" />
            </button>
        )}
    </div>
);

const Section = ({ title, children, empty }) => (
    <div className="fsb-section">
        <div className="fsb-title">{title}</div>
        {children}
        {empty && <div className="fsb-empty">{empty}</div>}
    </div>
);

const FolderSidebar = ({ current, onOpen }) => {
    const prefs = useFolderPrefs();
    const quick = useMemo(quickAccess, []);
    const [drives, setDrives] = useState([]);

    useEffect(() => { fsApi.drives().then(setDrives).catch(() => {}); }, []);

    const recent = prefs.recent.filter(p => !same(p, current)).slice(0, 6);

    return (
        <aside className="fsb">
            <Section title="Быстрый доступ">
                {quick.map(q => (
                    <Item key={q.path} icon={q.icon} label={q.name} sub={q.path}
                          active={same(q.path, current)} onClick={() => onOpen(q.path)} />
                ))}
            </Section>

            <Section title="Закреплённые" empty={!prefs.pinned.length && 'Закрепи папку кнопкой в панели пути'}>
                {prefs.pinned.map(p => (
                    <Item key={p.path} icon="bi-pin-angle-fill" label={p.name || baseName(p.path)} sub={p.path}
                          active={same(p.path, current)} onClick={() => onOpen(p.path)}
                          onRemove={() => togglePin(p.path)} removeTitle="Открепить" />
                ))}
            </Section>

            {recent.length > 0 && (
                <Section title="Недавние">
                    {recent.map(p => (
                        <Item key={p} icon="bi-clock-history" label={baseName(p)} sub={p}
                              onClick={() => onOpen(p)} onRemove={() => forgetRecent(p)} removeTitle="Убрать из недавних" />
                    ))}
                </Section>
            )}

            <Section title="Диски">
                {drives.map(d => {
                    const used = d.total ? 1 - d.free / d.total : null;
                    return (
                        <Item key={d.path}
                              icon={d.type === 'Network' ? 'bi-hdd-network' : d.type === 'Removable' ? 'bi-usb-drive' : 'bi-hdd'}
                              label={`${d.name || 'Диск'} (${d.label})`}
                              sub={d.total ? `Свободно ${fmtGB(d.free)} из ${fmtGB(d.total)}` : d.path}
                              active={same(d.path, current)}
                              onClick={() => onOpen(d.path)}>
                            {used != null && (
                                <span className={`fsb-usage ${used > 0.9 ? 'full' : ''}`}>
                                    <span style={{ width: `${Math.round(used * 100)}%` }} />
                                </span>
                            )}
                        </Item>
                    );
                })}
            </Section>
        </aside>
    );
};

export default React.memo(FolderSidebar);
