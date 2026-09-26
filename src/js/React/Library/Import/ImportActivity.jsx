import React, {useEffect, useRef, useState} from 'react';

// Global "import in progress" pill. Fed by the main process for every import source
// (dialog, drag & drop, folder, link, API / browser extension), so a long batch is
// visible from any section — not just when it's over.
const ImportActivity = () => {
    const [state, setState] = useState(null);   // { active, done, total, failed, current }
    const hideTimer = useRef(null);

    useEffect(() => {
        const { ipcRenderer } = window.require('electron');
        const onActivity = (_, a) => {
            clearTimeout(hideTimer.current);
            setState(a);
            // Linger on the result for a moment, then get out of the way.
            if (!a.active) hideTimer.current = setTimeout(() => setState(null), 3500);
        };
        ipcRenderer.on('library:importActivity', onActivity);
        return () => {
            ipcRenderer.removeListener('library:importActivity', onActivity);
            clearTimeout(hideTimer.current);
        };
    }, []);

    if (!state || !state.total) return null;

    const { active, done, total, failed, current } = state;
    const pct = Math.round((done / total) * 100);
    const ok  = done - failed;

    return (
        <div className={`import-activity ${active ? '' : 'finished'} ${!active && failed ? 'has-errors' : ''}`}>
            <div className="import-activity-icon">
                {active
                    ? <i className="bi bi-arrow-repeat spin" />
                    : <i className={`bi ${failed ? 'bi-exclamation-triangle-fill' : 'bi-check-lg'}`} />}
            </div>
            <div className="import-activity-body">
                <div className="import-activity-title">
                    {active
                        ? <>Импорт <b>{done}</b> / {total}</>
                        : <>Импорт завершён · {ok}{failed ? `, ошибок: ${failed}` : ''}</>}
                    {active && <span className="import-activity-pct">{pct}%</span>}
                </div>
                {active && current && <div className="import-activity-file" title={current}>{current}</div>}
                <div className="import-activity-bar">
                    <div style={{ width: `${active ? pct : 100}%` }} />
                </div>
            </div>
        </div>
    );
};

export default ImportActivity;
