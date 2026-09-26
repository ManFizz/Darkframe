import React, {useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {libraryApi} from '@/Infrastructure/Ipc';

const SHOW_AFTER = 250;   // don't flash the overlay when startup is quick

// Covers the app until the first library data (collection tree + counters) is in.
// Until then clicks would only queue behind the initial queries anyway.
const BootOverlay = () => {
    const [phase, setPhase] = useState('pending');   // pending → shown → leaving → done
    const [slow, setSlow]   = useState(false);

    useEffect(() => {
        let cancelled = false;
        const showTimer = setTimeout(() => !cancelled && setPhase(p => p === 'pending' ? 'shown' : p), SHOW_AFTER);
        const slowTimer = setTimeout(() => !cancelled && setSlow(true), 6000);

        Promise.allSettled([LibraryService.loadCollections(), libraryApi.getStats()]).then(() => {
            if (cancelled) return;
            clearTimeout(showTimer);
            setPhase(p => {
                if (p === 'pending') return 'done';
                setTimeout(() => !cancelled && setPhase('done'), 260);
                return 'leaving';
            });
        });
        return () => { cancelled = true; clearTimeout(showTimer); clearTimeout(slowTimer); };
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
