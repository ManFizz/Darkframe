const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const Tag = sequelize.define('Tag', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false
	},
	type: {
		type: DataTypes.INTEGER
	},
	remoteType: {
		type: DataTypes.INTEGER
	}
}, {
	timestamps: false
});

Tag.sync().then();

module.exports = Tag;