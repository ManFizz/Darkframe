const Item = require("./Item");
const Tag = require("./Tag");
const ItemTag = require("./ItemTag");
const Collection = require("./Collection");

Item.belongsToMany(Tag, {
    through: ItemTag,
    foreignKey: 'itemId',
    otherKey: 'tagId',
    as: 'tags',
});

Tag.belongsToMany(Item, {
    through: ItemTag,
    foreignKey: 'tagId',
    otherKey: 'itemId',
    as: 'items',
});

Item.belongsTo(Collection, { foreignKey: 'collectionId', as: 'collection' });
Collection.hasMany(Item, { foreignKey: 'collectionId', as: 'items' });

module.exports = { Item, Tag, ItemTag };