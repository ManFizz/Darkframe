const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const Favorite = sequelize.define('Favorites', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	title: {
		type: DataTypes.STRING(256)
	},
	thumbUrl: {
		type: DataTypes.STRING(1024),
		allowNull: false,
		unique: true
	},
	priority: {
		type: DataTypes.INTEGER,
		defaultValue: 1,
		allowNull: false
	},
	sourceUrl: {
		type: DataTypes.STRING(1024),
		defaultValue: ''
	},
	tags: {
		type: DataTypes.STRING,
		defaultValue: ''
	},
	remoteType: {
		type: DataTypes.INTEGER,
		allowNull: false
	},
	createdAt: {
		type: DataTypes.INTEGER,
		defaultValue: () => Math.floor(Date.now() / 1000),
		allowNull: true
	},
	localUrl: {
		type: DataTypes.STRING(512),
		allowNull: true,
	},
}, {
	timestamps: false
});

module.exports = Favorite;