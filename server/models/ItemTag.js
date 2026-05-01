const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const ItemTag = sequelize.define('ItemTag', {
    itemId: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
    },
    tagId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
}, { timestamps: false });

module.exports = ItemTag;