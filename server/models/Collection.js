const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Collection = sequelize.define('Collection', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING(256),
        allowNull: false,
    },
    parentId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    icon: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },
    color: {
        type: DataTypes.STRING(32),
        allowNull: true,
    },
    order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    isSystem: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    },
    createdAt: {
        type: DataTypes.INTEGER,
        defaultValue: () => Math.floor(Date.now() / 1000),
    },
}, { timestamps: false });

module.exports = Collection;