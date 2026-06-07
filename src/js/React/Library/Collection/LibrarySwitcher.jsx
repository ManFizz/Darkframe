import React, {useCallback, useEffect, useRef, useState} from 'react';
import {libraryRegistryApi} from '@/Infrastructure/Ipc';

const LibrarySwitcher = () => {
    const [libraries, setLibraries] = useState([]);
    const [activeId, setActiveId]   = useState(null);
    const [open, setOpen]           = useState(false);
    const [adding, setAdding]       = useState(false);
    const [newName, setNewName]     = useState('');
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const wrapperRef = useRef(null);

    const reload = useCallback(async () => {
        const { libraries, activeId } = await libraryRegistryApi.list();
        setLibraries(libraries);
        setActiveId(activeId);
    }, []);

    useEffect(() => { reload(); }, [reload]);

    useEffect(() => {
        const onClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const active = libraries.find(l => l.id === activeId);

    const handleSwitch = (id) => {
        if (id === activeId) { setOpen(false); return; }
        libraryRegistryApi.switch(id);
        // App relaunches — no need to update state.
    };

    const handleAdd = async () => {
        const folderPath = await libraryRegistryApi.pickFolder();
        if (!folderPath) return;
        await libraryRegistryApi.add(newName, folderPath);
        setNewName('');
        setAdding(false);
        await reload();
    };

    const startRename = (lib) => {
        setRenamingId(lib.id);
        setRenameValue(lib.name);
    };

    const commitRename = async () => {
        const trimmed = renameValue.trim();
        const lib = libraries.find(l => l.id === renamingId);
        if (!lib || !trimmed || trimmed === lib.name) {
            setRenamingId(null);
            return;
        }
        await libraryRegistryApi.rename(lib.id, trimmed);
        setRenamingId(null);
        await reload();
    };

    const handleRemove = async (lib) => {
        if (lib.id === activeId) {
            alert('Нельзя удалить активную библиотеку. Сначала переключитесь на другую.');
            return;
        }
        const deleteFiles = confirm(
            `Удалить библиотеку "${lib.name}"?\n\n` +
            `OK — удалить запись И файлы с диска.\n` +
            `Cancel — оставить файлы, убрать только из списка.`
        );
        try {
            await libraryRegistryApi.remove(lib.id, deleteFiles);
            await reload();
        } catch (e) {
            alert(e.message || 'Не удалось удалить');
        }
    };

    return (
        <div className="library-switcher" ref={wrapperRef}>
            <button
                className="library-switcher-button"
                onClick={() => setOpen(v => !v)}
                title="Сменить библиотеку"
            >
                <i className="bi bi-collection" />
                <span className="library-switcher-name">{active?.name || '—'}</span>
                <i className={`bi bi-chevron-${open ? 'up' : 'down'} library-switcher-caret`} />
            </button>

            {open && (
                <div className="library-switcher-menu">
                    {libraries.map(lib => (
                        <div
                            key={lib.id}
                            className={`library-switcher-item ${lib.id === activeId ? 'active' : ''}`}
                        >
                            {renamingId === lib.id ? (
                                <input
                                    autoFocus
                                    className="library-switcher-rename-input"
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') commitRename();
                                        if (e.key === 'Escape') setRenamingId(null);
                                        e.stopPropagation();
                                    }}
                                />
                            ) : (
                                <>
                                    <div
                                        className="library-switcher-item-main"
                                        onClick={() => handleSwitch(lib.id)}
                                        title={lib.dbPath}
                                    >
                                        <i className={`bi bi-${lib.id === activeId ? 'check2-circle' : 'circle'}`} />
                                        <span>{lib.name}</span>
                                    </div>
                                    <div className="library-switcher-item-actions">
                                        <button onClick={() => startRename(lib)} title="Переименовать">
                                            <i className="bi bi-pencil" />
                                        </button>
                                        <button onClick={() => handleRemove(lib)} title="Удалить">
                                            <i className="bi bi-trash" />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}

                    <div className="library-switcher-divider" />

                    {adding ? (
                        <div className="library-switcher-add-row">
                            <input
                                autoFocus
                                placeholder="Название (необязательно)"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleAdd();
                                    if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                                }}
                            />
                            <button onClick={handleAdd} title="Выбрать папку">
                                <i className="bi bi-folder2-open" />
                            </button>
                            <button onClick={() => { setAdding(false); setNewName(''); }} title="Отмена">
                                <i className="bi bi-x" />
                            </button>
                        </div>
                    ) : (
                        <button className="library-switcher-add" onClick={() => setAdding(true)}>
                            <i className="bi bi-plus-circle" />
                            <span>Добавить библиотеку...</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default LibrarySwitcher;
