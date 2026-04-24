import React, {useEffect, useRef} from "react";

const ScrollSensor = ({ onVisible, enabled }) => {
    const sensorRef = useRef(null);

    useEffect(() => {
        if (!enabled) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    onVisible();
                }
            },
            { threshold: 0.1 }
        );

        if (sensorRef.current) observer.observe(sensorRef.current);

        return () => observer.disconnect();
    }, [onVisible, enabled]);

    return <div ref={sensorRef} style={{ height: "10px", margin: "20px 0" }} />;
};

export default ScrollSensor;