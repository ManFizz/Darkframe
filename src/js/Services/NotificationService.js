let listeners = new Set();
let history = [];

export function subscribeNotifications(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

// `action` is an optional { label, onClick } — renders a button in the toast
// (used for e.g. "Moved to trash · Undo").
export function notify({ message, type = 'info', duration = 3000, action = null }) {
    const notification = {
        id: Date.now() + Math.random(),
        message,
        type,
        duration,
        action,
        time: new Date(),
    };
    history.push(notification);
    listeners.forEach(cb => cb(notification));
}

export function getHistory() { return [...history]; }
export function clearHistory() { history = []; }
export function removeFromHistory(id) { history = history.filter(n => n.id !== id); }