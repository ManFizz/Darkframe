import React, {useRef} from 'react';
import Thumb from "../Thumb/Thumb";
import ScrollSensor from "../Helpers/ScrollSensor";
import {getHistory, runSearch, setQuery, useBooruQuery, useSearchStatus} from "@modules/r34/booruQuery";
import {currentR34Source} from "@modules/r34/R34Controller";
import useFavoriteTags from "@hooks/useFavoriteTags";

// What the booru gallery shows while it has nothing to show: a skeleton while the
// first page loads, "nothing found" after an empty search, or a start screen with
// saved tags / recent searches before any search.
const EmptyState = () => {
    const status = useSearchStatus();
    const q = useBooruQuery();
    const { favoriteTags } = useFavoriteTags();
    const source = currentR34Source?.remoteType;

    if (status.loading) {
        return (
            <div className="booru-skeleton">
                {Array.from({ length: 16 }, (_, i) => <div key={i} style={{ height: 180 + ((i * 53) % 120) }} />)}
            </div>
        );
    }

    if (status.error && status.source === source) {
        return (
            <div className="booru-empty">
                <i className="bi bi-wifi-off" />
                <div className="be-title">Не удалось загрузить</div>
                <div className="be-sub">{status.error}</div>
                <button className="be-btn" onClick={() => runSearch()}>Повторить</button>
            </div>
        );
    }

    if (status.query != null && status.source === source) {
        const hasFilters = q.minScore > 0 || q.rating !== 'any';
        return (
            <div className="booru-empty">
                <i className="bi bi-search" />
                <div className="be-title">Ничего не найдено</div>
                <div className="be-sub">
                    {hasFilters ? 'Попробуй снять фильтры score / рейтинга' : 'Проверь написание тегов или убери исключения'}
                </div>
                {hasFilters && <button className="be-btn" onClick={() => runSearch({ minScore: 0, rating: 'any' })}>Снять фильтры</button>}
            </div>
        );
    }

    const favs = favoriteTags.filter(t => t.remote_type === source).slice(0, 14);
    const history = getHistory(source).slice(0, 5);
    return (
        <div className="booru-empty start">
            <div className="be-hero"><i className="bi bi-stars" /></div>
            <div className="be-title">{currentR34Source?.name}: с чего начнём?</div>
            <div className="be-sub">Введи теги в строке сверху — или начни с этого:</div>
            <div className="be-actions">
                <button className="be-btn primary" onClick={() => runSearch({ tags: [] })}>
                    <i className="bi bi-lightning-charge" /> Свежие посты
                </button>
                <button className="be-btn" onClick={() => runSearch({ tags: [], sort: 'score' })}>
                    <i className="bi bi-fire" /> Лучшие
                </button>
            </div>
            {favs.length > 0 && (
                <div className="be-group">
                    <div className="be-label">Избранные теги</div>
                    <div className="be-chips">
                        {favs.map(f => (
                            <button key={f.tag} className="be-chip" onClick={() => runSearch({ tags: [f.tag] })}>{f.tag}</button>
                        ))}
                    </div>
                </div>
            )}
            {history.length > 0 && (
                <div className="be-group">
                    <div className="be-label">Недавние поиски</div>
                    <div className="be-chips">
                        {history.map(h => (
                            <button key={h.tags.join(' ')} className="be-chip hist"
                                    onClick={() => { setQuery({ tags: h.tags }); runSearch(); }}>
                                <i className="bi bi-clock-history" /> {h.tags.join(' ')}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const Gallery = ({ modalFileId, modalUpdater, displayArray, typeView, loadNextPage, isSelected }) => {
    const isLoadingRef = useRef(false);

    if (!displayArray.length) return <EmptyState />;

    return (
        <div className={`gallery-view-${typeView}`} tabIndex="0" style={{ outline: 'none' }}>
            {displayArray.map((file) => (
                <Thumb
                    key={file.uniqueId}
                    file={file}
                    modalUpdater={modalUpdater}
                    isModal={modalFileId === file.uniqueId}
                    isSelected={isSelected?.(file.uniqueId) ?? false}
                />
            ))}

            <ScrollSensor
                enabled={modalFileId === null}
                onVisible={() => {
                    if (isLoadingRef.current) return;
                    isLoadingRef.current = true;
                    Promise.resolve(loadNextPage()).finally(() => {
                        isLoadingRef.current = false;
                    });
                }}
            />
        </div>
    );
};

export default React.memo(Gallery);
