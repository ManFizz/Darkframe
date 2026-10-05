import React, {useEffect, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';
import {appUrl} from '@/Infrastructure/electron';
import {compareItemFromThumb, openCompare} from '../../Compare/CompareView';
import {runVisualSearch} from '@services/visualSearch';

// "Search the library by this picture" — opens the results view (closes the viewer).
export const SearchByThisButton = ({ file, onOpened }) => (
    String(file?.mimeType || '').startsWith('image/') ? (
        <button className="rel-search" onClick={async () => {
            if (await runVisualSearch({ id: file.id, label: file.title || file.fileName, preview: file.thumbUrl })) onOpened?.();
        }}>
            <i className="bi bi-images" /> Искать похожие во всей библиотеке
        </button>
    ) : null
);

const fmtSize = (b) => (b == null ? '' : b < 1024 ** 2 ? `${Math.round(b / 1024)} КБ` : `${(b / 1024 ** 2).toFixed(1)} МБ`);

// Exact copies and look-alikes of the open library item. Fetched with a short
// delay so arrow-key browsing doesn't fire a request per skipped file.
export function useRelations(file) {
    const [data, setData] = useState(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        setData(null);
        if (!file?.id) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            libraryApi.itemRelations(file.id)
                .then(res => { if (!cancelled) setData(res); })
                .catch(() => { if (!cancelled) setData({ exact: [], similar: [], unhashed: 0 }); });
        }, 350);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [file?.id, version]);
    return { data, reload: () => setVersion(v => v + 1) };
}

// "Nothing similar" note — at the end of the panel, next to the library-wide search.
export const RelatedHint = ({ file, data }) => (
    data && !data.exact.length && !data.similar.length && data.unhashed > 0 && String(file.mimeType || '').startsWith('image/') ? (
        <div className="rel-hint" title="Панель управления → Дубликаты → Похожие → «Посчитать отпечатки»">
            <i className="bi bi-info-circle" /> Похожих не найдено среди файлов с отпечатком ({data.unhashed} без отпечатка)
        </div>
    ) : null
);

// Found copies / look-alikes, each one click away from a side-by-side comparison.
const RelatedBlock = ({ file, data, reload, onChanged }) => {
    if (!data || (!data.exact.length && !data.similar.length)) return null;

    const compare = (row) => openCompare(
        [compareItemFromThumb(file), { ...row, url: appUrl(`library://item/${row.id}`) }],
        { onDone: () => { reload(); onChanged?.(); } },
    );

    const Thumbs = ({ rows }) => (
        <div className="rel-thumbs">
            {rows.map(r => (
                <button key={r.id} className="rel-thumb" onClick={() => compare(r)}
                        title={`${r.title}\n${r.width}×${r.height} · ${fmtSize(r.size)} · ${r.collectionName}${r.similarity ? `\nсходство ${r.similarity}%` : ''}\nНажми, чтобы сравнить`}>
                    <img src={r.thumbPath} alt="" loading="lazy" />
                    {r.similarity != null && <span className="rel-sim">{r.similarity}%</span>}
                </button>
            ))}
        </div>
    );

    return (
        <div className="rel-block">
            {data.exact.length > 0 && (
                <div className="rel-group exact">
                    <div className="rel-title">
                        <i className="bi bi-exclamation-triangle-fill" /> Точная копия в библиотеке: {data.exact.length}
                    </div>
                    <Thumbs rows={data.exact} />
                </div>
            )}
            {data.similar.length > 0 && (
                <div className="rel-group">
                    <div className="rel-title"><i className="bi bi-images" /> Похожие: {data.similar.length}</div>
                    <Thumbs rows={data.similar} />
                </div>
            )}
        </div>
    );
};

export default RelatedBlock;
