const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const CollectionFavorite = sequelize.define('CollectionFavorite', {
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

CollectionFavorite.sync().then();

module.exports = CollectionFavorite;