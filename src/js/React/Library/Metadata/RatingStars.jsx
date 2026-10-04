import React, {useState} from 'react';

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// 10 stars with their numbers under them: the stars up to the pointer (or up to
// the current rating) light up together with their numbers, and the big figure
// on the right says what a click would set. Click the current star to clear.
const RatingStars = ({ value, onChange }) => {
    const [hover, setHover] = useState(0);
    const shown = hover || value || 0;
    return (
        <div className={`rating-stars ${hover ? 'hovering' : ''}`} onMouseLeave={() => setHover(0)}>
            <div className="rating-stars-row">
                {STARS.map(star => (
                    <button
                        key={star}
                        type="button"
                        className={`rating-star ${star <= shown ? 'on' : ''} ${star === shown ? 'edge' : ''}`}
                        onMouseEnter={() => setHover(star)}
                        onClick={() => onChange(star === value ? 0 : star)}
                        title={star === value ? 'Снять оценку' : `Оценка ${star}`}
                    >
                        <i className={`bi bi-star${star <= shown ? '-fill' : ''}`} />
                        <span className="rating-star-n">{star}</span>
                    </button>
                ))}
            </div>
            <div className="rating-stars-value" title={hover ? 'Будет поставлено' : 'Текущая оценка'}>
                {shown ? <><b>{shown}</b><span>/10</span></> : <span className="none">—</span>}
                {hover && hover === value ? <em>снять</em> : null}
            </div>
        </div>
    );
};

export default RatingStars;
