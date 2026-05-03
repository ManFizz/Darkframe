const sequelize = require("./database");
const { DataTypes } = require('sequelize');

async function migrations() {
    const queryInterface = sequelize.getQueryInterface();
    const tableDesc = await queryInterface.describeTable('Items');

    if (!tableDesc.order) {
        await queryInterface.addColumn('Items', 'order', {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false,
        });
    }
    if (!tableDesc.fileHash) {
        await queryInterface.addColumn('Items', 'fileHash', {
            type: DataTypes.STRING(64),
            allowNull: true,
        });

        await queryInterface.addIndex('Items', ['fileHash'], {
            unique: true,
            name: 'items_fileHash_unique',
        });
    }
}

module.exports = { migrations};