import React, {useEffect, useState} from "react";
import {subscribeNotifications} from "../../Services/NotificationService";

const Notifications = () => {
    const [items, setItems] = useState([]);

    useEffect(() => {
        const unsub = subscribeNotifications((notif) => {
            setItems(prev => [...prev, notif]);

            // автоудаление через 4 секунды
            setTimeout(() => {
                setItems(prev => prev.filter(n => n.id !== notif.id));
            }, 4000);
        });

        return unsub;
    }, []);

    return (
        <div
            className="toast-container position-fixed bottom-0 end-0 p-3"
            style={{ zIndex: 9999 }}
        >
            {items.map(n => (
                <div key={n.id} className={`toast show text-white bg-${n.type} mb-2`}>
                    <div className="d-flex">
                        <div className="toast-body">
                            {n.message}
                        </div>
                        <button
                            className="btn-close btn-close-white me-2 m-auto"
                            onClick={() =>
                                setItems(prev => prev.filter(x => x.id !== n.id))
                            }
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default Notifications;