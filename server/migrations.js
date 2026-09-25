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
    if (!tableDesc.phash) {
        // Perceptual hash for near-duplicates (computed lazily).
        await queryInterface.addColumn('Items', 'phash', {
            type: DataTypes.STRING(16),
            allowNull: true,
            defaultValue: null,
        });
    }
    if (!tableDesc.editParams) {
        // Full image-edit parameters (JSON), re-applied from the source on each save.
        await queryInterface.addColumn('Items', 'editParams', {
            type: DataTypes.TEXT,
            allowNull: true,
            defaultValue: null,
        });
    }
    if (!tableDesc.thumbAt) {
        // Video only: the second of the frame chosen as the thumbnail.
        await queryInterface.addColumn('Items', 'thumbAt', {
            type: DataTypes.FLOAT,
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
    }

    // fileHash used to be UNIQUE (dedup on import). Duplicates are now allowed on
    // purpose, so drop the unique index and keep a plain one for fast grouping.
    const itemIndexes = await queryInterface.showIndex('Items');
    if (itemIndexes.find(i => i.name === 'items_fileHash_unique')) {
        await queryInterface.removeIndex('Items', 'items_fileHash_unique');
    }
    if (!itemIndexes.find(i => i.name === 'items_fileHash_idx')) {
        await queryInterface.addIndex('Items', ['fileHash'], { name: 'items_fileHash_idx' });
    }
    const tagsDesc = await queryInterface.describeTable('Tags');
    if (!tagsDesc.pinned) {
        // User-pinned tags float to the top of pickers and filters.
        await queryInterface.addColumn('Tags', 'pinned', {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
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

    // Deduplicated "recently viewed" log (per section). New table — create if missing.
    await require('./models/ViewHistory').sync();

    // Resume positions for long videos. New table — create if missing.
    await require('./models/VideoPosition').sync();
}

module.exports = { migrations};