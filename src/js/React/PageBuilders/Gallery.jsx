import React, {useRef} from 'react';
import Thumb from "../Thumb/Thumb";
import ScrollSensor from "../Helpers/ScrollSensor";
import {getHistory, runSearch, setQuery, useBooruQuery, useSearchStatus} from "@modules/r34/booruQuery";
import {currentR34Source} from "@modules/r34/R34Controller";
import useFavoriteTags from "@hooks/useFavoriteTags";
import SavedSearchesPage from "@modules/r34/SavedSearchesPage";
import FavTagsPage from '@modules/r34/FavTagsPage';
import {postKey} from "@modules/r34/libraryLinks";
import {blockedBy} from "@modules/r34/blacklist";
import {ipcRenderer} from "@/Infrastructure/electron";

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
                {status.errorCode === 'CF_CHALLENGE' ? (
                    <div className="be-actions">
                        <button className="be-btn primary" onClick={async () => {
                            if (await ipcRenderer.invoke('danbooru:verify')) runSearch();
                        }}>
                            <i className="bi bi-shield-check" /> Пройти проверку
                        </button>
                        <button className="be-btn" onClick={() => runSearch()}>Повторить</button>
                    </div>
                ) : (
                    <button className="be-btn" onClick={() => runSearch()}>Повторить</button>
                )}
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

// Bottom of the booru grid in infinite-scroll mode: spinner while the next API page
// loads, "that's all" once there is nothing more.
const GalleryFooter = ({ hasMore, loadedCount }) => {
    const status = useSearchStatus();
    if (status.loading) return <div className="gallery-footer"><i className="bi bi-arrow-repeat spin" /> Загружаю ещё…</div>;
    if (!hasMore) return <div className="gallery-footer end"><i className="bi bi-check2-circle" /> Это всё — {loadedCount.toLocaleString('ru-RU')} постов</div>;
    return <div className="gallery-footer" />;
};

const Gallery = ({ modalFileId, modalUpdater, displayArray, typeView, loadNextPage, isSelected,
                   onToggleSelect, selectionActive, inLibrary, blacklist, infinite = true, hasMore, loadedCount, onDragPost }) => {
    const isLoadingRef = useRef(false);
    const { view } = useBooruQuery();

    if (view === 'saved') return <SavedSearchesPage source={currentR34Source?.remoteType} />;
    if (view === 'favtags') return <FavTagsPage source={currentR34Source?.remoteType} />;
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
                    onToggleSelect={onToggleSelect}
                    selectionActive={selectionActive}
                    inLibrary={inLibrary ? inLibrary.has(postKey(file.sourceUrl)) : false}
                    blockedTag={blacklist ? blockedBy(file, blacklist) : null}
                    onDragStart={onDragPost}
                />
            ))}

            <ScrollSensor
                enabled={modalFileId === null && infinite}
                onVisible={() => {
                    if (isLoadingRef.current) return;
                    isLoadingRef.current = true;
                    Promise.resolve(loadNextPage()).finally(() => {
                        isLoadingRef.current = false;
                    });
                }}
            />
            {infinite && <GalleryFooter hasMore={hasMore} loadedCount={loadedCount} />}
        </div>
    );
};

export default React.memo(Gallery);
