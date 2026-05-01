const Item = require("./Item");
const Tag = require("./Tag");
const ItemTag = require("./ItemTag");

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

module.exports = { Item, Tag, ItemTag };