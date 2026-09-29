import React, {useEffect, useRef, useState} from 'react';

// Small modal for Folders file operations: a name prompt (rename / new folder) or a
// yes/no confirmation (move to the recycle bin). `onSubmit` may throw — the message
// is shown in the dialog and it stays open.
const FsDialog = ({ title, text, icon = 'bi-pencil', initial, selectTo, submitLabel = 'OK', danger = false, onSubmit, onClose }) => {
    const [value, setValue] = useState(initial ?? '');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef(null);
    const withInput = initial !== undefined;

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        // Rename: select the name without its extension, like Explorer.
        el.setSelectionRange(0, selectTo ?? el.value.length);
    }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            await onSubmit(value);
            onClose();
        } catch (e) {
            setError(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
            setBusy(false);
        }
    };

    return (
        <div className="fsd-overlay" onMouseDown={onClose}>
            <div className="fsd" onMouseDown={e => e.stopPropagation()}
                 onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') submit(); }}>
                <div className="fsd-title"><i className={`bi ${icon}`} /> {title}</div>
                {text && <div className="fsd-text">{text}</div>}
                {withInput && (
                    <input ref={inputRef} className="form-control form-control-sm" value={value} spellCheck={false}
                           onChange={e => { setValue(e.target.value); setError(null); }} />
                )}
                {error && <div className="fsd-error"><i className="bi bi-exclamation-circle" /> {error}</div>}
                <div className="fsd-actions">
                    <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>Отмена</button>
                    <button className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy || (withInput && !value.trim())}
                            onClick={submit} autoFocus={!withInput}>
                        {busy ? <i className="bi bi-arrow-repeat spin" /> : submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FsDialog;
