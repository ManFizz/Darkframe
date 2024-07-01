const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const Favorite = sequelize.define('Favorite', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	title: {
		type: DataTypes.STRING(64)
	},
	thumbUrl: {
		type: DataTypes.STRING(512),
		allowNull: false,
		unique: true
	},
	priority: {
		type: DataTypes.INTEGER,
		defaultValue: 1,
		allowNull: false
	},
	sourceUrl: {
		type: DataTypes.STRING(256),
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
		defaultValue: Math.floor(Date.now() / 1000),
		allowNull: true
	},
}, {
	timestamps: false
});

Favorite.sync().then();

module.exports = Favorite;