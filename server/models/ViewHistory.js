const { DataTypes } = require('sequelize');
const sequelize = require('../database');

// Deduplicated "recently viewed" log: one row per (section, key). Re-viewing an item
// bumps lastViewedAt / viewCount instead of inserting a duplicate. `data` is a JSON
// snapshot of the ThumbFile so remote/folder items can be re-displayed without their
// original source being loaded.
const ViewHistory = sequelize.define('ViewHistories', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    section:       { type: DataTypes.INTEGER, allowNull: false },   // SOURCE_TYPES / remoteType
    key:           { type: DataTypes.STRING(1024), allowNull: false },
    data:          { type: DataTypes.TEXT, allowNull: false },
    viewCount:     { type: DataTypes.INTEGER, defaultValue: 1 },
    firstViewedAt: { type: DataTypes.INTEGER },
    lastViewedAt:  { type: DataTypes.INTEGER },
}, {
    timestamps: false,
    indexes: [{ unique: true, fields: ['section', 'key'], name: 'viewhistory_section_key' }],
});

module.exports = ViewHistory;
