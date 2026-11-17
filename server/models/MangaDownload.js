const { DataTypes } = require('sequelize');
const sequelize = require('../database');

// One manga download (online source → library). Kept in the DB so the queue
// survives a restart: unfinished jobs continue on the next start.
const MangaDownload = sequelize.define('MangaDownloads', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    source:       { type: DataTypes.STRING(32), allowNull: false },
    galleryId:    { type: DataTypes.STRING(256), allowNull: false },
    url:          { type: DataTypes.STRING(1024), allowNull: true },
    title:        { type: DataTypes.STRING(512), allowNull: true },
    cover:        { type: DataTypes.STRING(1024), allowNull: true },
    // queued | running | paused | done | error | canceled
    status:       { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'queued' },
    done:         { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total:        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    collectionId: { type: DataTypes.UUID, allowNull: true },
    itemId:       { type: DataTypes.UUID, allowNull: true },     // the library item once finished
    error:        { type: DataTypes.TEXT, allowNull: true },
    options:      { type: DataTypes.TEXT, allowNull: true },     // JSON: chapters, extra tags
    createdAt:    { type: DataTypes.INTEGER, allowNull: true },
    updatedAt:    { type: DataTypes.INTEGER, allowNull: true },
}, { timestamps: false });

module.exports = MangaDownload;
