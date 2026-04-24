const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const Collection = sequelize.define('Collections', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	name: {
		type: DataTypes.TEXT
	}
}, {
	timestamps: false
});

module.exports = Collection;