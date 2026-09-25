import {useEffect, useState} from 'react';

// Appearance, applied live (no relaunch): colour mode + accent colour. Stored locally.
//   mode   — 'dark' | 'light' | 'system' (follows the OS)
//   accent — any #rrggbb; every derived shade lives in CSS (see main.scss)

const KEY = 'jsg_theme';
const DEFAULTS = { mode: 'dark', accent: '#b06bff' };

export const ACCENT_PRESETS = [
    { name: 'Фиолетовый', value: '#b06bff' },
    { name: 'Синий',      value: '#4c8dff' },
    { name: 'Бирюзовый',  value: '#22c3d6' },
    { name: 'Зелёный',    value: '#3ecf8e' },
    { name: 'Янтарный',   value: '#f5a524' },
    { name: 'Оранжевый',  value: '#ff7a45' },
    { name: 'Розовый',    value: '#ff5fa2' },
    { name: 'Красный',    value: '#ff4d5e' },
];

const listeners = new Set();
let current = load();

function load() {
    try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
    catch { return { ...DEFAULTS }; }
}

const isHex = (s) => /^#[0-9a-f]{6}$/i.test(String(s || ''));

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
export const resolveMode = (mode) => (mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode);

export function applyTheme(prefs = current) {
    const mode = resolveMode(prefs.mode) === 'light' ? 'light' : 'dark';
    const accent = isHex(prefs.accent) ? prefs.accent : DEFAULTS.accent;
    const root = document.documentElement;

    root.setAttribute('data-bs-theme', mode);
    if (document.body) {
        document.body.setAttribute('data-bs-theme', mode);
        // index.html hard-codes .bg-dark on <body>; only keep it in dark mode.
        document.body.classList.toggle('bg-dark', mode === 'dark');
    }
    root.style.setProperty('--df-accent', accent);
    root.style.setProperty('--df-accent-rgb', hexToRgb(accent));
}

export function getTheme() { return current; }

export function setTheme(patch) {
    current = { ...current, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
    applyTheme(current);
    listeners.forEach(cb => cb(current));
}

export function subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export function useTheme() {
    const [theme, setState] = useState(current);
    useEffect(() => subscribe(setState), []);
    return [theme, setTheme];
}

// Apply once at startup (before the first render, so there's no flash), and keep
// following the OS while the mode is "system".
export function initTheme() {
    applyTheme(current);
    window.matchMedia?.('(prefers-color-scheme: dark)')
        .addEventListener?.('change', () => { if (current.mode === 'system') applyTheme(current); });
}
