import React from 'react';

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const RatingStars = ({ value, onChange }) => (
    <div className="rating-stars">
        {STARS.map(star => (
            <i
                key={star}
                className={`bi bi-star${star <= value ? '-fill' : ''}`}
                onClick={() => onChange(star === value ? 0 : star)}
            />
        ))}
    </div>
);

export default RatingStars;
