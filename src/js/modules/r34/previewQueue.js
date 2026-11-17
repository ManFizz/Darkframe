import {fetchPreview} from './R34Controller';

// Post previews for the saved searches / favourite tags pages: a session cache
// and a small queue (boorus rate-limit bursts of requests).
export const STRIP = 12;

export const previewCache = new Map();          // `${source}|${query}` → { total, items, error, at }
const waiting = [];
let running = 0;
const MAX_PARALLEL = 2;

function pump() {
    while (running < MAX_PARALLEL && waiting.length) {
        const job = waiting.shift();
        running++;
        job().finally(() => { running--; setTimeout(pump, 250); });
    }
}

export function loadPreview(key, query, force = false) {
    if (!force && previewCache.has(key)) return Promise.resolve(previewCache.get(key));
    return new Promise((resolve) => {
        waiting.push(async () => {
            let res;
            try {
                const { total, items } = await fetchPreview(query, STRIP);
                res = { total, items, at: Date.now() };
            } catch (e) {
                res = { total: null, items: [], error: e.message || 'Ошибка загрузки', at: Date.now() };
            }
            previewCache.set(key, res);
            resolve(res);
        });
        pump();
    });
}

