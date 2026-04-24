const { Op } = require("sequelize");
const Tag = require('../models/tag');

async function getTags() {
	try {
		return await Tag.findAll({ raw: true });
	} catch (error) {
		console.error('Error fetching tags:', error);
		throw error;
	}
}

async function setTags(tagsData) {
	try {
		const validTags = tagsData.filter(tag =>
			tag.name != null &&
			tag.type != null
		);

		if (!validTags.length) return;

		await Tag.bulkCreate(validTags, {
			updateOnDuplicate: ['type', 'remoteType', 'count']
		});

	} catch (error) {
		console.error('Error setting tags:', error);
		throw error;
	}
}

async function getTagsByNames(names) {
	try {
		if (!names.length) return [];

		return await Tag.findAll({
			where: {
				name: {
					[Op.in]: names
				}
			},
			raw: true
		});
	} catch (error) {
		console.error("Error getTagsByNames:", error);
		return [];
	}
}

module.exports = {
	getTags,
	setTags,
	getTagsByNames
};