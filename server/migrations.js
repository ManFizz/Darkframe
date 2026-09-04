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
    if (!tableDesc.editedAt) {
        // Bumped whenever the image is edited in-app; used to cache-bust library:// URLs.
        await queryInterface.addColumn('Items', 'editedAt', {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null,
        });
    }
    if (!tableDesc.deletedAt) {
        // Soft-delete marker: NULL = live, a unix timestamp = in the trash.
        await queryInterface.addColumn('Items', 'deletedAt', {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null,
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
    const indexes = await queryInterface.showIndex('Tags');
    if (!indexes.find(i => i.name === 'tags_name_idx')) {
        await queryInterface.addIndex('Tags', ['name'], { name: 'tags_name_idx' });
    }

    const collectionsDesc = await queryInterface.describeTable('Collections');
    if (!collectionsDesc.isSystem) {
        await queryInterface.addColumn('Collections', 'isSystem', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        });
    }
    if (!collectionsDesc.isSmart) {
        await queryInterface.addColumn('Collections', 'isSmart', {
            type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false,
        });
    }
    if (!collectionsDesc.filter) {
        await queryInterface.addColumn('Collections', 'filter', {
            type: DataTypes.TEXT, allowNull: true,
        });
    }

    // Tag rename rules (from → to). New table — create it if missing.
    await require('./models/TagAlias').sync();
}

module.exports = { migrations};