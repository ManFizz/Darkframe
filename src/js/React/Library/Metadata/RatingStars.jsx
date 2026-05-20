import React from 'react';

const RatingStars = ({ value, onChange }) => (
    <div className="rating-stars">
        {[1, 2, 3, 4, 5].map(star => (
            <i
                key={star}
                className={`bi bi-star${star <= value ? '-fill' : ''}`}
                onClick={() => onChange(star === value ? 0 : star)}
            />
        ))}
    </div>
);

export default RatingStars;
