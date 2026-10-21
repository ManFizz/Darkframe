// The control panel in a corner of the page. Built from a description, so every
// site gets the same panel with its own buttons and settings.

const { injectStyle } = require('./styles');

function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') e.className = v;
        else if (k === 'hidden') e.hidden = !!v;
        else if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
    for (const c of children) e.append(c);
    return e;
}

/**
 * build({ side, title, actions, settings, store, on }) → ui
 *   actions:  [{ key, label, primary? }]  — buttons; on.action(key)
 *   settings: [{ label, type: 'select' | 'checkbox', options?: [[value, label]], setting }]
 *   store:    the site's store (showDone, collection)
 *   on:       { action(key), stop(), showDone(v), token(), newCollection() }
 */
function build({ side = 'right', title, actions, settings = [], store, on }) {
    injectStyle();
    const old = document.getElementById('dfr-panel');
    const minimized = old?.classList.contains('dfr-min');
    old?.remove();

    const ui = {};
    const tokenBtn = el('button', { title: 'Токен Darkframe' }, '⚙');
    const minBtn = el('button', { title: 'Свернуть' }, '–');
    const head = el('div', { className: 'dfr-head' },
        el('span', { className: 'dfr-title' }, `Darkframe · ${title}`),
        el('span', { className: 'dfr-tools' }, tokenBtn, minBtn));

    ui.buttons = {};
    const actionRow = el('div', { className: 'dfr-row' });
    for (const a of actions) {
        const b = el('button', { className: a.primary ? 'dfr-primary' : '' }, a.label);
        b.onclick = () => on.action(a.key);
        ui.buttons[a.key] = b;
        actionRow.append(b);
    }
    const stopBtn = el('button', {}, 'Стоп');
    stopBtn.disabled = true;
    stopBtn.onclick = () => on.stop();
    actionRow.append(stopBtn);

    const show = el('input', { type: 'checkbox' });
    show.checked = !!store.showDone.get();
    show.onchange = () => { store.showDone.set(show.checked); on.showDone(show.checked); };
    const showLabel = el('span', {}, 'Показывать скачанные');
    const showRow = el('div', { className: 'dfr-row' }, el('label', {}, show, ' ', showLabel));

    const coll = el('select', { title: 'Коллекция для новых файлов' }, el('option', { value: '' }, 'Без коллекции'));
    coll.onchange = () => store.collection.set(coll.value);
    const newColl = el('button', { title: 'Новая коллекция' }, '＋');
    newColl.onclick = () => on.newCollection();
    const collRow = el('div', { className: 'dfr-row' }, coll, newColl);

    const settingRows = settings.map((s) => {
        if (s.type === 'checkbox') {
            const box = el('input', { type: 'checkbox' });
            box.checked = !!s.setting.get();
            box.onchange = () => s.setting.set(box.checked);
            return el('div', { className: 'dfr-row' }, el('label', {}, box, ` ${s.label}`));
        }
        const sel = el('select', {}, ...s.options.map(([v, l]) => el('option', { value: v }, l)));
        sel.value = String(s.setting.get());
        sel.onchange = () => s.setting.set(sel.value);
        return el('div', { className: 'dfr-row' }, s.label, sel);
    });

    const status = el('div', { className: 'dfr-status' }, 'Проверяю Darkframe…');
    const body = el('div', { className: 'dfr-body' }, actionRow, showRow, collRow, ...settingRows, status);
    const panel = el('div', { id: 'dfr-panel', className: `dfr-${side}${minimized ? ' dfr-min' : ''}` }, head, body);
    tokenBtn.onclick = () => on.token();
    minBtn.onclick = () => panel.classList.toggle('dfr-min');
    document.body.append(panel);

    return Object.assign(ui, {
        panel,
        setStatus(text) { status.textContent = text; },
        setHiddenCount(n) { showLabel.textContent = `Показывать скачанные (${n})`; },
        setLabel(key, text) { if (ui.buttons[key] && ui.buttons[key].textContent !== text) ui.buttons[key].textContent = text; },
        setRunning(running) {
            for (const b of Object.values(ui.buttons)) b.disabled = running;
            stopBtn.disabled = !running;
        },
        fillCollections(list) {
            while (coll.options.length > 1) coll.remove(1);
            for (const c of list || []) coll.append(el('option', { value: c.id }, `${'  '.repeat(c.depth)}${c.name}`));
            const want = String(store.collection.get() || '');
            coll.value = want;
            if (coll.value !== want) coll.value = '';
        },
    });
}

module.exports = { build };
