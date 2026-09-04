const { DataTypes } = require('sequelize');
const sequelize = require('../database');

// A permanent rename rule: any attempt to add tag `from` stores `to` instead.
const TagAlias = sequelize.define('TagAliases', {
    id:   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    from: { type: DataTypes.STRING, allowNull: false, unique: true },
    to:   { type: DataTypes.STRING, allowNull: false },
}, { timestamps: false });

module.exports = TagAlias;
