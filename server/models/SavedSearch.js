const { DataTypes } = require('sequelize');
const sequelize = require('../database');

// A remembered booru search (like gelbooru's "saved searches"): the full query of one
// source, shown on its own page with a strip of the latest matching posts.
const SavedSearch = sequelize.define('SavedSearches', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    source:    { type: DataTypes.INTEGER, allowNull: false },          // SOURCE_TYPES (r34 / gelbooru)
    // Normalised query: space-joined tags ("-tag" = excluded) + modifiers. `key`
    // is the canonical form used to tell whether a query is already saved.
    tags:      { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    minScore:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sort:      { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'new' },
    rating:    { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'any' },
    key:       { type: DataTypes.STRING(1024), allowNull: false },
    title:     { type: DataTypes.STRING(256), allowNull: true },
    position:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.INTEGER, allowNull: true },
    // Post count when the search was last opened → "N new since then".
    lastTotal: { type: DataTypes.INTEGER, allowNull: true },
    lastOpenedAt: { type: DataTypes.INTEGER, allowNull: true },
}, {
    timestamps: false,
    indexes: [{ unique: true, fields: ['source', 'key'] }],
});

module.exports = SavedSearch;
