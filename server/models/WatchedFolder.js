const { DataTypes } = require('sequelize');
const sequelize = require('../database');

// A folder whose new files are copied into the library automatically (downloads,
// screenshots…). The originals stay where they are.
const WatchedFolder = sequelize.define('WatchedFolders', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    path:         { type: DataTypes.STRING(1024), allowNull: false, unique: true },
    enabled:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    recursive:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    collectionId: { type: DataTypes.UUID, allowNull: true },
    tags:         { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },   // JSON array of names
    // Files changed after this moment (ms) are picked up on the next start — the
    // catch-up for whatever arrived while the app was closed.
    lastScanAt:   { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    createdAt:    { type: DataTypes.INTEGER, allowNull: true },
}, { timestamps: false });

module.exports = WatchedFolder;
