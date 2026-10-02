const { DataTypes } = require('sequelize');
const sequelize = require('../database');

// Where the reader stopped in a library manga, and when. One row per manga item.
const MangaState = sequelize.define('MangaStates', {
    itemId:   { type: DataTypes.UUID, primaryKey: true },
    chapter:  { type: DataTypes.STRING(32), allowNull: true },    // chapter id from manga.json
    page:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },   // index inside the chapter
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },   // index across all pages
    total:    { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    finished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    readAt:   { type: DataTypes.INTEGER, allowNull: true },
}, { timestamps: false });

module.exports = MangaState;
