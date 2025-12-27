-- Таблица Источников
CREATE TABLE Sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL
);

-- Таблица Медиа
CREATE TABLE Media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (source_id) REFERENCES Sources(id)
);

-- Таблица Тегов
CREATE TABLE Tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES Sources(id)
);

-- Таблица Связей Медиа-Теги
CREATE TABLE MediaTags (
    media_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    FOREIGN KEY (media_id) REFERENCES Media(id),
    FOREIGN KEY (tag_id) REFERENCES Tags(id),
    PRIMARY KEY (media_id, tag_id)
);

-- Таблица Истории Просмотров
CREATE TABLE History (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    viewed_at DATETIME NOT NULL,
    FOREIGN KEY (media_id) REFERENCES Media(id)
);

-- Таблица Коллекций
CREATE TABLE Collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL
);

-- Таблица Связей Коллекции-Медиа
CREATE TABLE CollectionMedia (
    collection_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    FOREIGN KEY (collection_id) REFERENCES Collections(id),
    FOREIGN KEY (media_id) REFERENCES Media(id),
    PRIMARY KEY (collection_id, media_id)
);