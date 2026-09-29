import {ipcRenderer} from './electron';

/**
 * fetch() for remote sites, executed by the main process (netController). Same
 * shape as window.fetch for what the app uses: ok / status / headers.get() /
 * text() / json() / arrayBuffer(), and AbortSignal support.
 */
let seq = 0;

export async function httpFetch(url, { signal, headers, method, binary = false } = {}) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const id = `r${++seq}`;
    const onAbort = () => ipcRenderer.send('net:abort', id);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        const res = await ipcRenderer.invoke('net:fetch', {
            id, url, method, headers: headers || {}, as: binary ? 'binary' : 'text',
        });
        if (res.error) {
            if (res.error === 'aborted' || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            throw new TypeError(res.error);
        }
        const hdrs = new Headers(res.headers);
        return {
            ok: res.ok,
            status: res.status,
            statusText: res.statusText,
            headers: hdrs,
            text: async () => (typeof res.body === 'string' ? res.body : new TextDecoder().decode(res.body)),
            json: async () => JSON.parse(typeof res.body === 'string' ? res.body : new TextDecoder().decode(res.body)),
            arrayBuffer: async () => (typeof res.body === 'string'
                ? new TextEncoder().encode(res.body).buffer
                : res.body.buffer.slice(res.body.byteOffset, res.body.byteOffset + res.body.byteLength)),
        };
    } finally {
        signal?.removeEventListener('abort', onAbort);
    }
}
