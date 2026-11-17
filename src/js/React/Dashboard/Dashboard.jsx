import React, {useEffect, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';

const fmtNum = (n) => (n || 0).toLocaleString('ru-RU');

const fmtSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i > 0 && n < 100 ? 1 : 0)} ${units[i]}`;
};

const fmtDuration = (sec) => {
    sec = Math.round(sec || 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h >= 100) return `${h} ч`;
    if (h) return `${h} ч ${m} мин`;
    return `${m} мин`;
};

// "2026-09" → short month + year (Russian month names)
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const fmtMonth = (m) => {
    const [y, mo] = (m || '').split('-');
    return mo ? `${MONTHS[Number(mo) - 1]} ${y.slice(2)}` : m;
};

const Kpi = ({ icon, label, value, hint }) => (
    <div className="dash-kpi">
        <i aria-hidden="true" className={`bi ${icon}`} />
        <div className="dash-kpi-body">
            <div className="dash-kpi-value">{value}</div>
            <div className="dash-kpi-label">{label}</div>
            {hint && <div className="dash-kpi-hint">{hint}</div>}
        </div>
    </div>
);

const TYPE_COLORS = {
    images: '#b06bff',
    videos: '#4cc2ff',
    gifs:   '#ffb64c',
};

const Dashboard = ({ onClose }) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        libraryApi.getDashboard().then(setData).catch(e => setError(e.message));
    }, []);

    const types = data ? [
        { key: 'images', label: 'Изображения', count: data.images },
        { key: 'videos', label: 'Видео',        count: data.videos },
        { key: 'gifs',   label: 'GIF',          count: data.gifs },
    ] : [];
    const typeTotal = types.reduce((s, t) => s + t.count, 0) || 1;

    const ratingMax = data ? Math.max(1, ...data.ratingDistribution.slice(1)) : 1;
    const timelineMax = data ? Math.max(1, ...data.timeline.map(t => t.count)) : 1;
    const timeline = data ? data.timeline.slice(-12) : [];
    const tagMax = data && data.topTags.length ? data.topTags[0].count : 1;

    // Rendered as a tab inside the Control Panel — just the scrolling body.
    return (
        <div className="settings-body dashboard-body">
                    {error && <div className="settings-error">{error}</div>}
                    {!data && !error && (
                        <div className="settings-loading">
                            <i aria-hidden="true" className="bi bi-arrow-repeat spin me-2" />Считаю…
                        </div>
                    )}

                    {data && (
                        <>
                            {/* KPI row */}
                            <div className="dash-kpis">
                                <Kpi icon="bi-collection" label="Всего файлов" value={fmtNum(data.total)} />
                                <Kpi icon="bi-hdd" label="Объём" value={fmtSize(data.totalSize)} />
                                <Kpi icon="bi-folder2" label="Коллекций" value={fmtNum(data.collectionsCount)}
                                     hint={`${fmtNum(data.uncategorized)} без коллекции`} />
                                <Kpi icon="bi-tags" label="Тегов" value={fmtNum(data.tagsCount)}
                                     hint={data.tagsTotal !== data.tagsCount ? `${fmtNum(data.tagsTotal)} всего` : null} />
                                <Kpi icon="bi-film" label="Общая длит." value={fmtDuration(data.totalDuration)} />
                                <Kpi icon="bi-trash" label="В корзине" value={fmtNum(data.trashCount)}
                                     hint={data.trashCount ? `${fmtSize(data.trashSize)} можно вернуть` : null} />
                            </div>

                            <div className="dash-grid">
                                {/* Type breakdown */}
                                <section className="dash-card">
                                    <h3>По типам</h3>
                                    <div className="dash-typebar">
                                        {types.map(t => t.count > 0 && (
                                            <div
                                                key={t.key}
                                                className="dash-typebar-seg"
                                                style={{ width: `${(t.count / typeTotal) * 100}%`, background: TYPE_COLORS[t.key] }}
                                                title={`${t.label}: ${fmtNum(t.count)}`}
                                            />
                                        ))}
                                    </div>
                                    <div className="dash-legend">
                                        {types.map(t => (
                                            <div key={t.key} className="dash-legend-item">
                                                <span className="dash-dot" style={{ background: TYPE_COLORS[t.key] }} />
                                                {t.label}
                                                <b>{fmtNum(t.count)}</b>
                                                <span className="dash-legend-pct">
                                                    {((t.count / typeTotal) * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Rating distribution */}
                                <section className="dash-card">
                                    <h3>
                                        Рейтинг
                                        <span className="dash-card-note">
                                            ср. {data.avgRating ? data.avgRating.toFixed(1) : '—'} · без оценки {fmtNum(data.unrated)}
                                        </span>
                                    </h3>
                                    <div className="dash-bars">
                                        {data.ratingDistribution.slice(1).map((c, i) => (
                                            <div key={i} className="dash-bar-col" title={`${i + 1}★: ${fmtNum(c)}`}>
                                                <div className="dash-bar-val">{c || ''}</div>
                                                <div className="dash-bar" style={{ height: `${(c / ratingMax) * 100}%` }} />
                                                <div className="dash-bar-label">{i + 1}</div>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Timeline */}
                                {timeline.length > 0 && (
                                    <section className="dash-card dash-card-wide">
                                        <h3>Пополнение по месяцам</h3>
                                        <div className="dash-bars">
                                            {timeline.map(t => (
                                                <div key={t.month} className="dash-bar-col" title={`${fmtMonth(t.month)}: ${fmtNum(t.count)}`}>
                                                    <div className="dash-bar-val">{t.count}</div>
                                                    <div className="dash-bar dash-bar-accent" style={{ height: `${(t.count / timelineMax) * 100}%` }} />
                                                    <div className="dash-bar-label">{fmtMonth(t.month)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Top tags */}
                                {data.topTags.length > 0 && (
                                    <section className="dash-card">
                                        <h3>Частые теги</h3>
                                        <div className="dash-taglist">
                                            {data.topTags.map(t => (
                                                <div key={t.id} className="dash-tagrow" title={`${t.name}: ${fmtNum(t.count)}`}>
                                                    <span className="dash-tagrow-name">{t.name}</span>
                                                    <span className="dash-tagrow-track">
                                                        <span className="dash-tagrow-fill" style={{ width: `${(t.count / tagMax) * 100}%` }} />
                                                    </span>
                                                    <span className="dash-tagrow-count">{fmtNum(t.count)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Largest files */}
                                {data.largest.length > 0 && (
                                    <section className="dash-card">
                                        <h3>Крупнейшие файлы</h3>
                                        <div className="dash-filelist">
                                            {data.largest.map(f => (
                                                <div key={f.id} className="dash-filerow">
                                                    <i aria-hidden="true" className={`bi ${f.mimeType?.startsWith('video/') ? 'bi-film' : 'bi-image'}`} />
                                                    <span className="dash-filerow-name" title={f.title || f.fileName}>
                                                        {f.title || f.fileName}
                                                    </span>
                                                    <span className="dash-filerow-size">{fmtSize(f.size)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        </>
                    )}
        </div>
    );
};

export default Dashboard;
