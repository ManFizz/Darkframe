const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const CollectionFavorite = sequelize.define('CollectionFavorites', {
	id_col: {
		type: DataTypes.INTEGER,
		allowNull: false
	},
	id_fav: {
		type: DataTypes.INTEGER,
		allowNull: false
	}
}, {
	timestamps: false
});

module.exports = CollectionFavorite;