const sequelize = require("../database");
const { DataTypes } = require('sequelize');

async function migration_1() {
    const queryInterface = sequelize.getQueryInterface();
    const tableDesc = await queryInterface.describeTable('Items');

    if (!tableDesc.order) {
        await queryInterface.addColumn('Items', 'order', {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false,
        });
        console.log('Added order column to Items');
    }
}

module.exports = { migration_1 };