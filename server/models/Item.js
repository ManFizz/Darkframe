const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database');

const Item = sequelize.define('Item', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    fileName:       { type: DataTypes.STRING(512), allowNull: false },
    title:          { type: DataTypes.STRING(512), defaultValue: '' },
    sourceUrl:      { type: DataTypes.STRING(1024), defaultValue: '' },
    notes:          { type: DataTypes.TEXT, defaultValue: '' },
    rating:         { type: DataTypes.INTEGER, defaultValue: 0 },
    width:          { type: DataTypes.INTEGER, defaultValue: 0 },
    height:         { type: DataTypes.INTEGER, defaultValue: 0 },
    size:           { type: DataTypes.INTEGER, defaultValue: 0 },
    mimeType:       { type: DataTypes.STRING(128), defaultValue: '' },
    duration:       { type: DataTypes.FLOAT, allowNull: true },
    collectionId:   { type: DataTypes.UUID, allowNull: true },
    order:          { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
    fileHash:       { type: DataTypes.STRING(64), allowNull: true, unique: true, },
    importedAt:     { type: DataTypes.INTEGER, defaultValue: () => Math.floor(Date.now() / 1000), },
    createdAt:      { type: DataTypes.INTEGER, allowNull: true, },
    // Soft-delete: NULL = live item, unix timestamp = moved to trash.
    deletedAt:      { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    // Last in-app edit (rotate/crop) timestamp; NULL = never edited. Cache-busts URLs.
    editedAt:       { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
}, {
    timestamps: false,
    // Every ordinary read/count automatically hides trashed items. The trash and
    // permanent-delete/restore paths opt out with Item.unscoped() (or the
    // onlyTrashed scope) — see libraryController.
    defaultScope: { where: { deletedAt: null } },
    scopes: {
        onlyTrashed: { where: { deletedAt: { [Op.ne]: null } } },
    },
});

module.exports = Item;