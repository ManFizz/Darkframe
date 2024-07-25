const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const History = sequelize.define('Histories', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	url: {
		type: DataTypes.TEXT,
		allowNull: false
	},
	type: {
		type: DataTypes.INTEGER,
		allowNull: false
	},
	date: {
		type: DataTypes.INTEGER,
		allowNull: false
	}
}, {
	timestamps: false
});

History.sync().then();

module.exports = History;