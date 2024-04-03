const {DataTypes} = require("sequelize");
const sequelize = require('../database');

const RemoteType = sequelize.define('RemoteType', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	name: {
		type: DataTypes.STRING(64)
	}
}, {
	timestamps: false
});

RemoteType.sync().then();

const remoteTypesData = [
	{ id: 1, name: 'Folder' },
	{ id: 2, name: 'Rule34' },
	{ id: 3, name: 'Pr365' },
	{ id: 4, name: 'Gelbooru' }
];

remoteTypesData.forEach(async (remoteTypeData) => {
	const existingRemoteType = await RemoteType.findOne({ where: { id: remoteTypeData.id } });
	if (!existingRemoteType) {
		try {
			await RemoteType.create(remoteTypeData);
			console.log(`Remote type '${remoteTypeData.name}' added successfully.`);
		} catch (error) {
			console.error(`Error adding remote type '${remoteTypeData.name}':`, error);
		}
	} else {
		console.log(`Remote type '${remoteTypeData.name}' already exists.`);
	}
});

module.exports = RemoteType;