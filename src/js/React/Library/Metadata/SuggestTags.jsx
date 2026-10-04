import React, {useEffect, useState} from 'react';
import {autotagApi} from '@/Infrastructure/Ipc';
import {openAutotagSettings} from '@services/autotagRun';

// Viewer panel: tags the local tagger sees in this picture — click one to add it,
// or add all. Asks the model only on request (it takes a moment on CPU).
const SuggestTags = ({ file, onAdd, label = null, children = null }) => {
    const [state, setState] = useState(null);   // null | 'busy' | { list } | { error } | 'nomodel'

    useEffect(() => { setState(null); }, [file?.id]);

    const ask = async () => {
        setState('busy');
        const st = await autotagApi.status();
        if (!st.installed) { setState('nomodel'); return; }
        const res = await autotagApi.suggest([file.id]).catch(e => ({ [file.id]: { error: e.message } }));
        const r = res[file.id];
        setState(r?.error ? { error: r.error } : { list: r || [] });
    };

    const add = (names) => {
        onAdd(names);
        setState(s => ({ list: s.list.filter(t => !names.includes(t.name)) }));
    };

    // `label`: the section title, shown in one row with the button; `children`
    // (the tag editor) go between that row and the suggestions.
    const ask_btn = (
        <button className="st-ask" onClick={ask} title="Локальная нейросеть предложит теги по картинке">
            <i className="bi bi-stars" /> Предложить теги
        </button>
    );
    const head = (extra = null) => (
        <>{label ? <div className="st-row"><label>{label}</label>{extra}</div> : extra}{children}</>
    );
    if (!state) return head(ask_btn);
    if (state === 'busy') return head(<div className="st-hint"><i className="bi bi-arrow-repeat spin" /> Смотрю на картинку…</div>);
    if (state === 'nomodel') {
        return <>{head(null)}<div className="st-hint">
            Нужна модель автотегов (~380 МБ). <button className="st-link" onClick={openAutotagSettings}>Скачать…</button>
        </div></>;
    }
    if (state.error) return <>{head()}<div className="st-hint err">{state.error}</div></>;
    if (!state.list.length) return head(<div className="st-hint">Новых тегов не нашлось</div>);

    return (
        <>{head()}<div className="st-box">
            <div className="st-head">
                <span><i className="bi bi-stars" /> Предложения</span>
                <button className="st-link" onClick={() => add(state.list.map(t => t.name))}>добавить все ({state.list.length})</button>
            </div>
            <div className="st-chips">
                {state.list.map(t => (
                    <button key={t.name} className={`st-chip ${t.category}`} onClick={() => add([t.name])}
                            title={`${Math.round(t.score * 100)}% уверенности — нажми, чтобы добавить`}>
                        {t.name}<span>{Math.round(t.score * 100)}</span>
                    </button>
                ))}
            </div>
        </div></>
    );
};

export default SuggestTags;
