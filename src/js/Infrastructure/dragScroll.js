/**
 * Scrolling while something is being dragged, anywhere in the app:
 *  - edge auto-scroll: near the top / bottom edge of the scrollable box under the
 *    cursor, that box scrolls (faster the closer to the edge);
 *  - mouse wheel: Windows swallows wheel events during a drag, so the main process
 *    forwards them from a global hook ('drag:wheel') and they are applied to the
 *    scrollable box under the cursor.
 * Install once (AppInitializer).
 */
const { ipcRenderer } = window.require('electron');

const EDGE = 70;        // px from the edge where auto-scroll starts
const MAX_SPEED = 22;   // px per frame at the very edge

let point = null;       // last cursor position seen in dragover
let box = null;         // scrollable element under it
let velocity = 0;
let raf = null;
let active = false;
let idleTimer = null;

function scrollableAt(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        if (!(n instanceof HTMLElement)) continue;
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return document.scrollingElement;
}

function tick() {
    if (box && velocity) box.scrollTop += velocity;
    raf = velocity ? requestAnimationFrame(tick) : null;
}

function setActive(on) {
    if (on === active) return;
    active = on;
    ipcRenderer.send('drag:active', on);
    if (!on) {
        velocity = 0;
        point = box = null;
    }
}

function onDragOver(e) {
    setActive(true);
    // A drag that leaves the window without dragend/drop: stop after a quiet spell
    // (dragover keeps firing every ~50 ms while the cursor is over the page).
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setActive(false), 800);

    point = { x: e.clientX, y: e.clientY };
    box = scrollableAt(e.target);
    if (!box) return;
    const r = box === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight }
        : box.getBoundingClientRect();
    const top = e.clientY - r.top;
    const bottom = r.bottom - e.clientY;
    velocity = top < EDGE ? -MAX_SPEED * (1 - Math.max(0, top) / EDGE)
        : bottom < EDGE ? MAX_SPEED * (1 - Math.max(0, bottom) / EDGE)
        : 0;
    if (velocity && raf == null) raf = requestAnimationFrame(tick);
}

function onDragDone() {
    clearTimeout(idleTimer);
    setActive(false);
}

let installed = false;
export function installDragScroll() {
    if (installed) return;
    installed = true;
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('drop', onDragDone, true);
    document.addEventListener('dragend', onDragDone, true);
    ipcRenderer.on('drag:wheel', (_, { dx, dy }) => {
        if (!active || !point) return;
        const el = scrollableAt(document.elementFromPoint(point.x, point.y));
        el?.scrollBy({ left: dx, top: dy });
    });
}
