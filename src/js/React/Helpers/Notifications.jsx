import React, {useCallback, useEffect, useState} from 'react';
import {subscribeNotifications} from '@services/NotificationService';

const ICONS = {
    success: 'bi-check-circle-fill',
    danger:  'bi-exclamation-triangle-fill',
    warning: 'bi-exclamation-circle-fill',
    info:    'bi-info-circle-fill',
};

const NotificationItem = ({ notification, onRemove }) => {
    useEffect(() => {
        if (!notification.duration) return;
        const timer = setTimeout(() => onRemove(notification.id), notification.duration);
        return () => clearTimeout(timer);
    }, [notification.id, notification.duration, onRemove]);

    return (
        <div className={`notification-item notification-${notification.type}`}>
            <i className={`bi ${ICONS[notification.type] || ICONS.info} notification-icon`} />
            <span className="notification-message">{notification.message}</span>
            <button className="notification-close" onClick={() => onRemove(notification.id)}>
                <i className="bi bi-x" />
            </button>
        </div>
    );
};

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);

    const remove = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    useEffect(() => {
        return subscribeNotifications((notification) => {
            setNotifications(prev => [...prev, notification]);
        });
    }, []);

    if (!notifications.length) return null;

    return (
        <div className="notifications-container">
            {notifications.map(n => (
                <NotificationItem
                    key={n.id}
                    notification={n}
                    onRemove={remove}
                />
            ))}
        </div>
    );
};

export default Notifications;