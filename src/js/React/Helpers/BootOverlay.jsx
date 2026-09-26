import React, {useEffect, useRef, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {libraryApi} from '@/Infrastructure/Ipc';

const SHOW_AFTER = 250;   // don't flash the overlay when startup is quick

// Covers the app until the first library data (collection tree + counters) is in.
// Until then clicks would only queue behind the initial queries anyway.
const BootOverlay = () => {
    const [phase, setPhase] = useState('pending');   // pending → shown → leaving → done
    const [slow, setSlow]   = useState(false);
    const shown = useRef(false);

    useEffect(() => {
        let cancelled = false;
        let leaveTimer = null;
        const showTimer = setTimeout(() => { shown.current = true; setPhase('shown'); }, SHOW_AFTER);
        const slowTimer = setTimeout(() => setSlow(true), 6000);

        Promise.allSettled([LibraryService.loadCollections(), libraryApi.getStats()]).then(() => {
            if (cancelled) return;
            clearTimeout(showTimer);
            clearTimeout(slowTimer);
            if (!shown.current) { setPhase('done'); return; }
            setPhase('leaving');                                   // fade out, then unmount
            leaveTimer = setTimeout(() => setPhase('done'), 260);
        });
        return () => {
            cancelled = true;
            clearTimeout(showTimer); clearTimeout(slowTimer); clearTimeout(leaveTimer);
        };
    }, []);

    if (phase === 'pending' || phase === 'done') return null;

    return (
        <div className={`boot-overlay ${phase === 'leaving' ? 'leaving' : ''}`} role="status" aria-live="polite">
            <div className="boot-card">
                <div className="boot-spinner" />
                <div className="boot-title">Загрузка библиотеки…</div>
                <div className="boot-sub">
                    {slow ? 'Первый запуск после обновления может занять больше времени' : 'Подготавливаем коллекции и медиа'}
                </div>
            </div>
        </div>
    );
};

export default BootOverlay;
