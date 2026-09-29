import React, {useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {ipcRenderer} from '@/Infrastructure/electron';
import {notify} from '@services/NotificationService';
import {rerunVisualSearch, runVisualSearch, useVisualSearch} from '@services/visualSearch';

// Strictness in words: allowed differing bits of the 64-bit perceptual hash.
const levelOf = (d) => (d <= 6 ? 'почти копии' : d <= 14 ? 'похожие' : d <= 20 ? 'отдалённо похожие' : 'очень широко');

// Bar above the "search by picture" results: what was searched for, how strict,
// how many found, and the hashes still missing (those images can't match yet).
const VisualSearchHeader = ({ onClose, sortedBySimilarity, onSortBySimilarity }) => {
    const vs = useVisualSearch();
    const [dist, setDist] = useState(vs.maxDistance);
    const [hashing, setHashing] = useState(null);   // { done, total }

    useEffect(() => { setDist(vs.maxDistance); }, [vs.maxDistance]);

    const hashAll = async () => {
        setHashing({ done: 0, total: vs.unhashed });
        const onProgress = (_, p) => setHashing(p);
        ipcRenderer.on('library:phashProgress', onProgress);
        const off = () => ipcRenderer.removeListener('library:phashProgress', onProgress);
        try {
            await LibraryService.computePhashes();
            await rerunVisualSearch(vs.maxDistance);
        } catch (e) {
            notify({ message: e.message, type: 'warning' });
        } finally {
            off();
            setHashing(null);
        }
    };

    return (
        <div className="vsearch-bar">
            {vs.query?.preview
                ? <img className="vsearch-preview" src={vs.query.preview} alt="" />
                : <span className="vsearch-preview icon"><i className="bi bi-image" /></span>}
            <div className="vsearch-info">
                <div className="vsearch-title">
                    Поиск по картинке: <b>{vs.query?.label || '—'}</b>
                </div>
                <div className="vsearch-sub">
                    {vs.loading ? <><i className="bi bi-arrow-repeat spin" /> Ищу…</>
                        : <>Найдено: <b>{vs.results.length}</b> · ищет те же картинки — пережатые, уменьшенные, обрезанные, перекрашенные</>}
                    {!sortedBySimilarity && (
                        <button className="vsearch-link" onClick={onSortBySimilarity}>упорядочить по сходству</button>
                    )}
                </div>
            </div>

            <label className="vsearch-strict" title="Сколько отличий допускать">
                <span>Строгость: {levelOf(dist)}</span>
                <input type="range" min={2} max={26} step={1} value={dist}
                       onChange={e => setDist(Number(e.target.value))}
                       onMouseUp={() => rerunVisualSearch(dist)}
                       onKeyUp={() => rerunVisualSearch(dist)} />
            </label>

            {vs.unhashed > 0 && (
                <button className="btn btn-sm btn-outline-secondary" disabled={!!hashing} onClick={hashAll}
                        title="Без отпечатка картинка не может попасть в результаты">
                    {hashing ? <><i className="bi bi-arrow-repeat spin" /> {hashing.done}/{hashing.total}</>
                        : <><i className="bi bi-fingerprint" /> Досчитать отпечатки ({vs.unhashed})</>}
                </button>
            )}
            <button className="btn btn-sm btn-outline-secondary" onClick={() => runVisualSearch({ clipboard: true })}
                    title="Искать по картинке из буфера обмена">
                <i className="bi bi-clipboard-image" />
            </button>
            <button className="vsearch-close" onClick={onClose} title="Закрыть поиск"><i className="bi bi-x-lg" /></button>
        </div>
    );
};

export default VisualSearchHeader;
