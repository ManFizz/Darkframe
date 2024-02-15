create table remote_types
(
    id   INTEGER    not null
        primary key autoincrement
        unique,
    name STRING(64) not null
        unique
);

create table favorites
(
    id          INTEGER               not null
        primary key autoincrement
        unique,
    name        STRING(64),
    url         STRING(512)           not null
        unique,
    display     INT         default 1 not null,
    source      STRING(256) default '',
    tags                    default '',
    remote_type integer               not null
        constraint favorites_remote_types_id_fk
            references remote_types
);

create table favorites_tags
(
    id      INTEGER
        primary key autoincrement,
    tag     STRING(64),
    display INT default 1,
    remote_type
        constraint favorites_tags_remote_types_id_fk
            references remote_types,
    constraint favorites_tags_pk
        unique (tag, remote_type)
);

create table history
(
    url       TEXT    not null,
    id        integer not null
        constraint id
            primary key,
    type      integer not null,
    id_remote integer
        constraint history_types_id_fk
            references remote_types,
    date      INT     not null
);

INSERT INTO remote_types (id, name) VALUES (1, 'Folder');
INSERT INTO remote_types (id, name) VALUES (2, 'Rule34');
INSERT INTO remote_types (id, name) VALUES (3, 'Pr365');
INSERT INTO remote_types (id, name) VALUES (4, 'Gelbooru');
