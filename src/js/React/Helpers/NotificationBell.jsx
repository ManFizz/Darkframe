import React, {useEffect, useRef, useState} from 'react';
import {clearHistory, getHistory, removeFromHistory, subscribeNotifications} from '@services/NotificationService';

const TYPE_ICON = {
    success: 'bi-check-circle-fill text-success',
    danger:  'bi-exclamation-triangle-fill text-danger',
    warning: 'bi-exclamation-circle-fill text-warning',
    info:    'bi-info-circle-fill text-info',
};

const NotificationBell = () => {
    const [history, setHistory]   = useState(getHistory());
    const [isOpen, setIsOpen]     = useState(false);
    const [unread, setUnread]     = useState(0);
    const dropdownRef             = useRef(null);

    useEffect(() => {
        return subscribeNotifications((n) => {
            setHistory(getHistory());
            if (!isOpen) setUnread(prev => prev + 1);
        });
    }, [isOpen]);

    // Закрываем при клике вне
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const open = () => {
        setIsOpen(v => !v);
        setUnread(0);
    };

    const remove = (id) => {
        removeFromHistory(id);
        setHistory(getHistory());
    };

    const clear = () => {
        clearHistory();
        setHistory([]);
    };

    return (
        <div className="notification-bell" ref={dropdownRef}>
            <button
                className="btn btn-outline-secondary position-relative"
                onClick={open}
                title="Уведомления"
            >
                <i className="bi bi-bell" />
                {unread > 0 && (
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-dropdown-header">
                        <span>Уведомления</span>
                        {history.length > 0 && (
                            <button className="btn btn-link btn-sm p-0 text-danger" onClick={clear}>
                                Очистить все
                            </button>
                        )}
                    </div>

                    <div className="notification-dropdown-list">
                        {history.length === 0 ? (
                            <div className="notification-dropdown-empty">
                                <i className="bi bi-bell-slash" />
                                <span>Нет уведомлений</span>
                            </div>
                        ) : (
                            [...history].reverse().map(n => (
                                <div key={n.id} className={`notification-dropdown-item notification-${n.type}`}>
                                    <i className={`bi ${TYPE_ICON[n.type] || TYPE_ICON.info}`} />
                                    <div className="notification-dropdown-content">
                                        <span className="notification-dropdown-message">{n.message}</span>
                                        <span className="notification-dropdown-time">
                                            {n.time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <button
                                        className="notification-dropdown-remove"
                                        onClick={() => remove(n.id)}
                                    >
                                        <i className="bi bi-x" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;