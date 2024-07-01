const Tag = require('../models/tag');


async function getTags() {
	try {
		return await Tag.findAll({
			raw: true
		});
	} catch (error) {
		console.error('Error fetching tags:', error);
		throw error;
	}
}

async function setTags(tagsData) {
	try {
		for (const tagData of tagsData) {
			const existingTag = await Tag.findOne({ where: { name: tagData.name } });
			if (existingTag) {
				await existingTag.update({
					type: tagData.type,
					remoteType: tagData.remoteType,
					count: tagData.count
				});
			} else {
				await Tag.create({
					name: tagData.name,
					type: tagData.type,
					remoteType: tagData.remoteType,
					count: tagData.count
				});
			}
		}
	} catch (error) {
		console.error('Error setting tags:', error);
		throw error;
	}
}

module.exports = {
	getTags,
	setTags
};
