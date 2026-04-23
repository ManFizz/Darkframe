let listeners = [];

export function subscribeNotifications(cb) {
    listeners.push(cb);
    return () => {
        listeners = listeners.filter(l => l !== cb);
    };
}

export function notify({ message, type = "danger" }) {
    listeners.forEach(cb => cb({ message, type, id: Date.now() }));
}