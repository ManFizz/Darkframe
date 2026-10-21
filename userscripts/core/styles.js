// The look of everything the script adds to a page — one place for every site.
// Colours are variables: change them here.

const CSS = `
#dfr-panel, .dfr-item-btn {
    --dfr-bg: rgba(15, 23, 42, .96);
    --dfr-fg: #e5e7eb;
    --dfr-muted: #cbd5e1;
    --dfr-accent: rgb(79, 70, 229);
    --dfr-border: rgba(99, 102, 241, .5);
    --dfr-field: #111827;
    --dfr-field-border: #374151;
}
.dfr-hidden { display: none !important; }
.dfr-done { opacity: .45; }
.dfr-rel { position: relative !important; }
.dfr-item-btn {
    font: 12px/1.3 system-ui, sans-serif; padding: 3px 8px; border-radius: 999px;
    border: 1px solid var(--dfr-border); background: var(--dfr-bg); color: #fff; cursor: pointer;
}
.dfr-item-btn:hover { background: var(--dfr-accent); }
.dfr-rel > .dfr-item-btn { position: absolute; top: 6px; right: 6px; z-index: 50; }
.dfr-item-holder { display: flex; justify-content: flex-end; padding: 2px 8px; }
#dfr-panel {
    position: fixed; bottom: 16px; z-index: 2147483646; width: 310px; box-sizing: border-box;
    background: var(--dfr-bg); color: var(--dfr-fg); border: 1px solid var(--dfr-border);
    border-radius: 12px; padding: 10px 12px; font: 13px/1.4 system-ui, sans-serif;
    box-shadow: 0 8px 24px rgba(0, 0, 0, .4); text-align: left;
}
#dfr-panel.dfr-right { right: 16px; }
#dfr-panel.dfr-left { left: 16px; }
#dfr-panel .dfr-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 8px; }
#dfr-panel .dfr-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#dfr-panel .dfr-tools { flex: none; display: flex; gap: 4px; }
#dfr-panel .dfr-row { display: flex; gap: 6px; margin: 6px 0; align-items: center; flex-wrap: wrap; }
#dfr-panel button {
    font: inherit; padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, .2);
    background: transparent; color: #fff; cursor: pointer;
}
#dfr-panel button.dfr-primary { background: var(--dfr-accent); }
#dfr-panel button:disabled { opacity: .5; cursor: default; }
#dfr-panel select {
    font: inherit; flex: 1; min-width: 0; background: var(--dfr-field); color: var(--dfr-fg);
    border: 1px solid var(--dfr-field-border); border-radius: 6px;
}
#dfr-panel label { cursor: pointer; }
#dfr-panel .dfr-status { white-space: pre-wrap; color: var(--dfr-muted); font-size: 12px; max-height: 120px; overflow: auto; }
#dfr-panel.dfr-min .dfr-body { display: none; }
#dfr-panel [hidden] { display: none !important; }
`;

function injectStyle() {
    if (document.getElementById('dfr-style')) return;
    const s = document.createElement('style');
    s.id = 'dfr-style';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
}

module.exports = { CSS, injectStyle };
