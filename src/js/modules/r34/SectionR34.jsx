import React, {useState} from 'react';
import {currentR34Source} from './R34Controller';
import {
    clearHistory, cycleTag, getHistory, runSearch, setQuery, tagState, useBooruQuery, useSearchStatus,
} from './booruQuery';
import useFavoriteTags from '@hooks/useFavoriteTags';
import {useTagKinds} from './tagKinds';
import {SOURCE_TYPES} from '@/Constants';

const SORTS = [
    { id: 'new',    label: 'Новые',     icon: 'bi-clock' },
    { id: 'score',  label: 'Лучшие',    icon: 'bi-fire' },
    { id: 'random', label: 'Случайные', icon: 'bi-shuffle' },
];
const SCORES = [0, 10, 50, 100, 500, 1000];
const RATINGS = [
    { id: 'any',          label: 'Любой' },
    { id: 'safe',         label: 'Safe' },
    { id: 'questionable', label: 'Quest.' },
    { id: 'explicit',     label: 'Explicit' },
];

const LOGO = { [SOURCE_TYPES.R34]: 'R34', [SOURCE_TYPES.GELBOORU]: 'GB', [SOURCE_TYPES.REALBOORU]: 'RB' };

const fmtTotal = (n) => n.toLocaleString('ru-RU');
const ago = (ms) => {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин назад`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ч назад`;
    return new Date(ms).toLocaleDateString('ru-RU');
};

const Segmented = ({ options, value, onChange }) => (
    <div className="bsb-seg">
        {options.map(o => (
            <button key={o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>
                {o.icon && <i className={`bi ${o.icon}`} />} {o.label}
            </button>
        ))}
    </div>
);

const Block = ({ title, extra, children }) => (
    <div className="bsb-block">
        <div className="bsb-title"><span>{title}</span>{extra}</div>
        {children}
    </div>
);

// Search sidebar for the booru sources: result summary, sort / score / rating
// modifiers, saved tags and recent searches. The tag input itself lives in the top bar.
const SectionR34 = ({ currentSource }) => {
    const q = useBooruQuery();
    const status = useSearchStatus();
    const { favoriteTags, addFavTag, removeFavTag } = useFavoriteTags();
    const [newTag, setNewTag] = useState('');
    const [customScore, setCustomScore] = useState('');

    const favs = favoriteTags.filter(t => t.remote_type === currentSource);
    const history = getHistory(currentSource);
    const searched = status.query != null && status.source === currentSource;

    // Modifiers re-run an existing search right away; before the first search they just preset it.
    const change = (patch) => (searched ? runSearch(patch) : setQuery(patch));
    const kindOf = useTagKinds(favs.map(f => f.tag));

    return (
        <section className="booru-sidebar">
            <div className="bsb-head">
                <div className="bsb-source">
                    <span className="bsb-logo">{LOGO[currentSource] || '?'}</span>
                    <div>
                        <div className="bsb-name">{currentR34Source?.name}</div>
                        <div className="bsb-status">
                            {status.loading ? <><i className="bi bi-arrow-repeat spin" /> Поиск…</>
                                : status.error && searched ? <span className="err"><i className="bi bi-exclamation-triangle" /> {status.error}</span>
                                : searched ? <>{fmtTotal(status.total || 0)} постов</>
                                : 'Готов к поиску'}
                        </div>
                    </div>
                </div>
            </div>

            <Block title="Сортировка">
                <Segmented options={SORTS} value={q.sort} onChange={v => change({ sort: v })} />
            </Block>

            <Block title="Минимальный score">
                <div className="bsb-chips">
                    {SCORES.map(s => (
                        <button key={s} className={`bsb-pill ${q.minScore === s ? 'active' : ''}`} onClick={() => change({ minScore: s })}>
                            {s === 0 ? 'любой' : `${s}+`}
                        </button>
                    ))}
                    <input className="bsb-num" type="number" min={0} placeholder="…" value={customScore}
                           onChange={e => setCustomScore(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter' && customScore !== '') change({ minScore: Math.max(0, Number(customScore) || 0) }); }} />
                </div>
            </Block>

            <Block title="Рейтинг">
                <Segmented options={RATINGS} value={q.rating} onChange={v => change({ rating: v })} />
            </Block>

            <Block title="Избранные теги"
                   extra={favs.length > 0 && <span className="bsb-hint">клик: + / − / ×</span>}>
                <div className="bsb-chips">
                    {favs.map(f => {
                        const st = tagState(f.tag);
                        return (
                            <span key={f.tag}
                                  className={`bsb-tag kind-${kindOf(f.tag)} ${st || ''}`}
                                  onClick={() => cycleTag(f.tag)}
                                  title={st === 'include' ? 'В запросе — нажми, чтобы исключить' : st === 'exclude' ? 'Исключён — нажми, чтобы убрать' : 'Добавить в запрос'}>
                                {st === 'include' && <i className="bi bi-plus" />}
                                {st === 'exclude' && <i className="bi bi-dash" />}
                                {f.tag}
                                <button onClick={e => { e.stopPropagation(); removeFavTag(f.tag, currentSource); }} title="Удалить из избранного">
                                    <i className="bi bi-x" />
                                </button>
                            </span>
                        );
                    })}
                    {!favs.length && <div className="bsb-empty">Сохраняй частые теги, чтобы добавлять их в поиск одним кликом</div>}
                </div>
                <div className="bsb-add">
                    <input placeholder="Новый избранный тег" value={newTag}
                           onChange={e => setNewTag(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { addFavTag(newTag, currentSource); setNewTag(''); } }} />
                    <button disabled={!newTag.trim()} onClick={() => { addFavTag(newTag, currentSource); setNewTag(''); }}>
                        <i className="bi bi-plus-lg" />
                    </button>
                    {q.tags.length > 0 && (
                        <button title="Сохранить теги текущего запроса"
                                onClick={() => q.tags.forEach(t => addFavTag(t.replace(/^-/, ''), currentSource))}>
                            <i className="bi bi-star" />
                        </button>
                    )}
                </div>
            </Block>

            {history.length > 0 && (
                <Block title="Недавние поиски"
                       extra={<button className="bsb-link" onClick={() => clearHistory(currentSource)}>очистить</button>}>
                    <div className="bsb-history">
                        {history.map(h => (
                            <button key={h.tags.join(' ')} className="bsb-hist" onClick={() => runSearch({ tags: h.tags })}>
                                <span className="bsb-hist-tags">
                                    {h.tags.map(t => <span key={t} className={t.startsWith('-') ? 'ex' : ''}>{t.replace(/^-/, '')}</span>)}
                                </span>
                                <span className="bsb-hist-time">{ago(h.at)}</span>
                            </button>
                        ))}
                    </div>
                </Block>
            )}
        </section>
    );
};

export default React.memo(SectionR34);
