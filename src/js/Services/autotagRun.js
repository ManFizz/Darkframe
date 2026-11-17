import {autotagApi} from '@/Infrastructure/Ipc';
import {ipcRenderer} from '@/Infrastructure/electron';
import {notify} from './NotificationService';

// Opens Control panel → Manage → Auto tags (NavBar listens).
export const openAutotagSettings = () =>
    window.dispatchEvent(new CustomEvent('df:openPanel', { detail: { tab: 'manage', tool: 'autotag' } }));

/**
 * Suggest + add tags for library items in one go (one undo step). Without the
 * model it offers to open the settings where it is downloaded.
 */
export async function autotagItems(ids, { onProgress } = {}) {
    const st = await autotagApi.status();
    if (!st.installed) {
        notify({
            message: 'Для автотегов нужна модель (~380 МБ, скачивается один раз)',
            type: 'info',
            duration: 8000,
            action: { label: 'Открыть', onClick: openAutotagSettings },
        });
        return null;
    }
    const handler = (_, p) => onProgress?.(p);
    ipcRenderer.on('autotag:progress', handler);
    try {
        const res = await autotagApi.suggest(ids);
        const tagsById = {};
        let failed = 0;
        Object.entries(res).forEach(([id, list]) => {
            if (list?.error) { failed++; return; }
            tagsById[id] = list.map(t => t.name);
        });
        const applied = await autotagApi.apply(tagsById);
        notify({
            message: applied.tags
                ? `Автотеги: +${applied.tags} тегов у ${applied.items} файлов${failed ? ` · не удалось: ${failed}` : ''} · Ctrl+Z — отменить`
                : failed ? `Не удалось разметить: ${failed}` : 'Новых тегов не нашлось',
            type: applied.tags ? 'success' : 'info',
            duration: 7000,
        });
        return applied;
    } finally {
        ipcRenderer.removeListener('autotag:progress', handler);
    }
}
