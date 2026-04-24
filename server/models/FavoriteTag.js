const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const FavoriteTag = sequelize.define('FavoriteTags', {
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

module.exports = FavoriteTag;