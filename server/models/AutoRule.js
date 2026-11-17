const { DataTypes } = require('sequelize');
const sequelize = require('../database');

// Import rule: when a new item matches `rules` (same condition tree as smart
// collections), apply the actions — add tags, file into a collection, set a rating.
const AutoRule = sequelize.define('AutoRules', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:         { type: DataTypes.STRING(256), allowNull: false, defaultValue: '' },
    enabled:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    apiOnly:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },   // only API / extension imports
    rules:        { type: DataTypes.TEXT, allowNull: false, defaultValue: '{"op":"all","items":[]}' },
    addTags:      { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },     // JSON array of names
    collectionId: { type: DataTypes.UUID, allowNull: true },
    rating:       { type: DataTypes.INTEGER, allowNull: true },                       // set only on unrated items
    position:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt:    { type: DataTypes.INTEGER, allowNull: true },
}, { timestamps: false });

module.exports = AutoRule;
