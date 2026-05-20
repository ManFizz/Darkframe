import React, {useEffect, useState} from 'react';

const EagleImportProgress = ({ onDone }) => {
    const [progress, setProgress] = useState(null);

    useEffect(() => {
        const { ipcRenderer } = window.require('electron');

        const handler = (_, data) => {
            setProgress(data);
            if (data.done) {
                setTimeout(() => {
                    setProgress(null);
                    onDone?.();
                }, 1500);
            }
        };

        ipcRenderer.on('library:importProgress', handler);
        return () => ipcRenderer.removeListener('library:importProgress', handler);
    }, [onDone]);

    if (!progress) return null;

    const percent = Math.round((progress.current / progress.total) * 100);

    return (
        <div className="eagle-import-overlay">
            <div className="eagle-import-modal">
                <div className="eagle-import-header">
                    <i className="bi bi-box-arrow-in-down me-2" />
                    {progress.done ? 'Импорт завершён' : 'Импорт из Eagle'}
                </div>

                <div className="eagle-import-body">
                    {!progress.done && (
                        <div className="eagle-import-file">
                            {progress.title}
                        </div>
                    )}

                    <div className="progress" style={{ height: 8 }}>
                        <div
                            className={`progress-bar ${progress.done ? 'bg-success' : ''}`}
                            style={{ width: `${percent}%`, transition: 'width 0.2s' }}
                        />
                    </div>

                    <div className="eagle-import-stats">
                        <span>{progress.current} / {progress.total}</span>
                        <span>{percent}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EagleImportProgress;
