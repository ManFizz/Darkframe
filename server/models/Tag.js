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
	userType: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
	coverItemId: { type: DataTypes.UUID, allowNull: true, defaultValue: null },   // model preview picked by hand
	remoteType: {
		type: DataTypes.INTEGER
	},
	count: {
		type: DataTypes.INTEGER
	},
	// Pinned by the user: shown first in tag pickers / filters.
	pinned: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false
	}
}, {
	timestamps: false
});

module.exports = Tag;
