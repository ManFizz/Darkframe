const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const Tag = sequelize.define('Tags', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
		unique: true
	},
	type: {
		type: DataTypes.INTEGER
	},
	remoteType: {
		type: DataTypes.INTEGER
	},
	count: {
		type: DataTypes.INTEGER
	}
}, {
	timestamps: false
});

module.exports = Tag;