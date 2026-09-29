import React, {useEffect, useState} from 'react';
import {
    ACTIONS, clearBinding, comboOf, isCustom, keyCaps, label, resetAll, resetBinding, setBinding, useKeymap,
} from '@services/keymap';
import {notify} from '@services/NotificationService';

const Caps = ({ binding }) => (
    <span className="km-caps">{keyCaps(binding).map((k, i) => <kbd key={i}>{k}</kbd>)}</span>
);

// Settings → «Горячие клавиши»: click a shortcut and press the new one. A key that
// already belongs to another action moves over (the other action loses it).
const KeymapSection = () => {
    const { bindingsOf } = useKeymap();
    const [capture, setCapture] = useState(null);   // { id, index }

    useEffect(() => {
        if (!capture) return;
        const onKey = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.code === 'Escape') { setCapture(null); return; }
            const combo = comboOf(e);
            if (!combo) return;   // a lone modifier: keep waiting
            const clash = setBinding(capture.id, combo, { replaceIndex: capture.index });
            if (clash) notify({ message: `${label(combo)} теперь для «${ACTIONS.find(a => a.id === capture.id).label}», у «${clash.label}» снято`, type: 'info', duration: 5000 });
            setCapture(null);
        };
        window.addEventListener('keydown', onKey, true);   // before every shortcut handler
        return () => window.removeEventListener('keydown', onKey, true);
    }, [capture]);

    const groups = [...new Set(ACTIONS.map(a => a.group))];

    return (
        <div className="settings-section">
            <div className="settings-section-title">
                <i className="bi bi-keyboard me-2" />
                Горячие клавиши
                <button className="km-reset-all" onClick={() => { resetAll(); notify({ message: 'Все сочетания — по умолчанию', type: 'info' }); }}>
                    сбросить всё
                </button>
            </div>
            <div className="km-hint">Нажми на сочетание и затем новые клавиши. Esc — отмена. Стрелки, Esc, Enter, Delete и цифры оценок не меняются.</div>
            {groups.map(g => (
                <div key={g} className="km-group">
                    <div className="km-group-title">{g}</div>
                    {ACTIONS.filter(a => a.group === g).map(a => {
                        const binds = bindingsOf(a.id);
                        return (
                            <div key={a.id} className={`km-row ${isCustom(a.id) ? 'custom' : ''}`}>
                                <span className="km-label">{a.label}</span>
                                <span className="km-binds">
                                    {binds.map((b, i) => (
                                        <span key={b} className={`km-bind ${capture?.id === a.id && capture.index === i ? 'capturing' : ''}`}>
                                            <button className="km-bind-btn" onClick={() => setCapture({ id: a.id, index: i })} title="Изменить">
                                                {capture?.id === a.id && capture.index === i ? 'Нажми сочетание…' : <Caps binding={b} />}
                                            </button>
                                            {binds.length > 1 && (
                                                <button className="km-x" onClick={() => clearBinding(a.id, i)} title="Убрать это сочетание">
                                                    <i className="bi bi-x" />
                                                </button>
                                            )}
                                        </span>
                                    ))}
                                    {capture?.id === a.id && capture.index === binds.length ? (
                                        <span className="km-bind capturing"><span className="km-bind-btn">Нажми сочетание…</span></span>
                                    ) : (
                                        <button className="km-add" onClick={() => setCapture({ id: a.id, index: binds.length })} title="Добавить ещё одно сочетание">
                                            <i className="bi bi-plus" />
                                        </button>
                                    )}
                                    {isCustom(a.id) && (
                                        <button className="km-add" onClick={() => resetBinding(a.id)} title="По умолчанию">
                                            <i className="bi bi-arrow-counterclockwise" />
                                        </button>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

export default KeymapSection;
