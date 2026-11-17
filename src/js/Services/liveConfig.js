import {useEffect, useState} from 'react';
import Settings from '@data/settings';
import PrivateData from '@data/private';

/**
 * Settings saved in the Control Panel apply without a restart. Every module reads
 * the same Settings / PrivateData objects, so the saved values are written into
 * them in place; views that derive something from them once (the source tabs)
 * re-render through useConfigVersion().
 */
let version = 0;
const listeners = new Set();

export function applyConfig({ settings, private: priv } = {}) {
    if (settings) Object.assign(Settings, settings);
    if (priv) Object.assign(PrivateData, priv);
    version++;
    listeners.forEach(fn => fn(version));
}

export function useConfigVersion() {
    const [v, setV] = useState(version);
    useEffect(() => {
        listeners.add(setV);
        return () => listeners.delete(setV);
    }, []);
    return v;
}
