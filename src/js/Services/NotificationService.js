let listeners = new Set();

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
    };
    listeners.forEach(cb => cb(notification));
}