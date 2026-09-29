import {libraryApi} from '@/Infrastructure/Ipc';
import {notify} from './NotificationService';

// Ctrl+Z / Ctrl+Y for library edits — the journal itself lives in the main
// process (services/undoJournal); this just asks and reports.
let busy = false;

async function step(kind) {
    if (busy) return;
    busy = true;
    try {
        const res = kind === 'undo' ? await libraryApi.undo() : await libraryApi.redo();
        if (!res) {
            notify({ message: kind === 'undo' ? 'Нечего отменять' : 'Нечего повторять', type: 'info', duration: 1500 });
            return;
        }
        notify({
            message: `${kind === 'undo' ? 'Отменено' : 'Повторено'}: ${res.label}`,
            type: 'info',
            duration: 5000,
            action: kind === 'undo' && res.redo
                ? { label: 'Повторить', onClick: () => redoLast() }
                : kind === 'redo' && res.undo ? { label: 'Отменить', onClick: () => undoLast() } : null,
        });
    } catch (e) {
        notify({ message: `Не удалось: ${e.message}`, type: 'warning' });
    } finally {
        busy = false;
    }
}

export const undoLast = () => step('undo');
export const redoLast = () => step('redo');
