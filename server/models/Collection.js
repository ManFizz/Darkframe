const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const Collection = sequelize.define('Collection', {
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

Collection.sync().then();

module.exports = Collection;