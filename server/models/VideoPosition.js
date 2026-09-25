const { DataTypes } = require('sequelize');
const sequelize = require('../database');

// Where the user stopped watching a long video, per (section, key) — the same
// source-stable key as the view history (lib:<id> / media URL / folder path).
// Kept separate from the history so clearing the history doesn't lose positions.
const VideoPosition = sequelize.define('VideoPositions', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    section:   { type: DataTypes.INTEGER, allowNull: false },
    key:       { type: DataTypes.STRING(1024), allowNull: false },
    position:  { type: DataTypes.FLOAT, allowNull: false },
    duration:  { type: DataTypes.FLOAT, allowNull: true },
    updatedAt: { type: DataTypes.INTEGER },
}, {
    timestamps: false,
    indexes: [{ unique: true, fields: ['section', 'key'], name: 'videopos_section_key' }],
});

module.exports = VideoPosition;
