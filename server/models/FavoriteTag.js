const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const FavoriteTag = sequelize.define('FavoriteTag', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	tag: {
		type: DataTypes.STRING(64)
	},
	display: {
		type: DataTypes.INTEGER,
		defaultValue: 1
	},
	remote_type: {
		type: DataTypes.INTEGER
	}
}, {
	timestamps: false
});

FavoriteTag.sync().then();

module.exports = FavoriteTag;