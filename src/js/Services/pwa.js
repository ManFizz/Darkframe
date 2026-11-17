import {useEffect, useState} from 'react';
import {isWeb} from '@/Infrastructure/electron';

/**
 * The app on a phone's home screen (opened over the network, see remote/server.js):
 * the service worker (a "computer is off" page instead of the browser's error),
 * the browser's install offer, standalone detection and full screen for the
 * page when it's opened in a browser tab.
 *
 * Browsers install apps only from secure pages: over plain http on the home
 * network Android Chrome needs the address marked as trusted (chrome://flags,
 * see the Devices tab); iOS Safari adds it to the home screen as is.
 */
let installEvent = null;
const listeners = new Set();
const changed = () => listeners.forEach(fn => fn());

export const isStandalone = () => typeof window !== 'undefined' && (
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true);

export function initPwa() {
    if (!isWeb || typeof window === 'undefined') return;
    if (isStandalone()) document.documentElement.classList.add('df-standalone');
    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; changed(); });
    window.addEventListener('appinstalled', () => { installEvent = null; changed(); });
    document.addEventListener('fullscreenchange', changed);
}

export async function installApp() {
    if (!installEvent) return false;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice.catch(() => ({ outcome: 'dismissed' }));
    installEvent = null;
    changed();
    return outcome === 'accepted';
}

const canFullscreen = () => !!document.fullscreenEnabled;
export const toggleFullscreen = () => (document.fullscreenElement
    ? document.exitFullscreen().catch(() => {})
    : document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}));

// { installable, standalone, fullscreen, canFullscreen } — live.
export function usePwa() {
    const read = () => ({
        installable: !!installEvent,
        standalone: isStandalone(),
        fullscreen: !!document.fullscreenElement,
        canFullscreen: isWeb && canFullscreen(),
    });
    const [state, setState] = useState(read);
    useEffect(() => {
        const on = () => setState(read());
        listeners.add(on);
        return () => listeners.delete(on);
    }, []);
    return state;
}
