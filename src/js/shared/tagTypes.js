// Tag categories. 0–6 are the booru ones (a tag gets them from the site it came
// from); the user can set any tag's category by hand (Tags.userType), which wins
// over the site's and survives the site's updates. 100+ are the user's own.
const MODEL_TYPE = 100;
const TAG_TYPES = {
    0: 'Общий', 1: 'Автор', 2: 'Тип 2', 3: 'Произведение', 4: 'Персонаж', 5: 'Мета', 6: 'Тип 6',
    [MODEL_TYPE]: 'Модель',
};
// What a person picks from (2 and 6 are unused leftovers of some boorus: still
// valid and shown by name, just not offered).
const TAG_TYPE_CHOICES = [MODEL_TYPE, 1, 4, 3, 0, 5].map(id => ({ id, label: TAG_TYPES[id] }));
const tagTypeLabel = (type) => (type == null ? 'Не задан' : TAG_TYPES[type] || `Тип ${type}`);

module.exports = { MODEL_TYPE, TAG_TYPES, TAG_TYPE_CHOICES, tagTypeLabel };
