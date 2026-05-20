import {useEffect, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';

export function useLibraryStats(version = 0) {
    const [stats, setStats] = useState({ total: 0, uncategorized: 0 });

    useEffect(() => {
        libraryApi.getStats().then(setStats);
    }, [version]);

    return stats;
}
