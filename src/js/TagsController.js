import { SaveTags } from "./backend";

class Tag {
	constructor({id, name, type, remoteType, count}) {
		this.id = id;
		this.name = name;
		this.type = type;
		this.remoteType = remoteType;
		this.count = count;
	}
}

let tags = [];

function isBad(obj) {
	return obj === null || obj === undefined;
}

export function UpdateTagsData(data, isDatabaseLoad = false) {
	const newData = data.map(e => new Tag(e));
	newData.forEach(newTag => {
		const existingTagIndex = tags.findIndex(tag => tag.name === newTag.name);

		if (existingTagIndex !== -1) {
			const existingTag = tags[existingTagIndex];
			if (isBad(existingTag.type)) {
				existingTag.type = newTag.type;
				existingTag.count = newTag.count;
			}
		} else {
			tags.push(newTag);
		}
	});
	if(!isDatabaseLoad)
		SaveTags();
}

export function GetTags() {
	return tags;
}