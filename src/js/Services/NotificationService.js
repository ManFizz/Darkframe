let listeners = new Set();
let history = [];

export function subscribeNotifications(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export function notify({ message, type = 'info', duration = 3000 }) {
    const notification = {
        id: Date.now() + Math.random(),
        message,
        type,
        duration,
        time: new Date(),
    };
    history.push(notification);
    listeners.forEach(cb => cb(notification));
}

export function getHistory() { return [...history]; }
export function clearHistory() { history = []; }
export function removeFromHistory(id) { history = history.filter(n => n.id !== id); }