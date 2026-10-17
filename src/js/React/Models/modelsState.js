import {useEffect, useState} from 'react';

// The model open in the Models tab: kept across tab switches, and read by the
// top bar (an open model is a library view — it gets the library's search / sort).
let open = null;
const listeners = new Set();

export const getOpenModel = () => open;
export function setOpenModel(model) {
    open = model || null;
    listeners.forEach(fn => fn(open));
}
export function useOpenModel() {
    const [m, setM] = useState(open);
    useEffect(() => { listeners.add(setM); return () => listeners.delete(setM); }, []);
    return m;
}
