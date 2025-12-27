import {SaveTags} from "./backend";
import {SOURCE_TYPES} from "./ThumbFile";

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
let tagsMap = new Map();
let onTagsUpdate = () => {};

export function setOnTagsUpdate(callback) {
	onTagsUpdate = callback;
}

export function UpdateTagsData(data, isDatabaseLoad = false) {
	const newData = data.map(e => new Tag(e));
	let hasChanges = false;

	if (tagsMap.size === 0 && tags.length > 0) {
		tags.forEach(t => tagsMap.set(t.name, t));
	}

	newData.forEach(newTag => {
		const existingTag = tagsMap.get(newTag.name);

		if (existingTag) {
			if (existingTag.type === null || existingTag.type === undefined) {
				existingTag.type = newTag.type;
				existingTag.count = newTag.count;
				hasChanges = true;
			}
		} else {
			tags.push(newTag);
			tagsMap.set(newTag.name, newTag); // Добавляем в карту новый тег
			hasChanges = true;
		}
	});

	if (hasChanges) {
		if (!isDatabaseLoad) {
			SaveTags();
		}
		onTagsUpdate([...tags]);
	}
}

export function GetTags() {
	return tags;
}

export function getToggledTags(currentString, tagToToggle) {
	let tags = currentString.split(' ').filter(t => t.trim() !== "");

	if (tagToToggle.startsWith('-')) {
		const pure = tagToToggle.substring(1);
		tags = tags.includes(pure) ? tags.filter(t => t !== pure) : [...tags, tagToToggle];
	} else {
		const negated = '-' + tagToToggle;
		if (tags.includes(negated)) {
			tags = tags.filter(t => t !== negated);
		} else {
			tags = tags.includes(tagToToggle) ? tags.filter(t => t !== tagToToggle) : [...tags, tagToToggle];
		}
	}
	return tags.join(' ');
}

export async function fetchTagSuggestions(tagPart, source) {
	if (!tagPart || tagPart.length < 2) return [];

	const match = tagPart.match(/[^ -][^ ]*$/);
	if (!match) return [];
	const lastWord = match[0];

	const url = source.tagUrl + lastWord + (source.remoteType === SOURCE_TYPES.R34 ? "" : "%");

	try {
		const response = await fetch(url);
		let list = await response.json();

		if (source.remoteType === SOURCE_TYPES.GELBOORU) {
			list = list.tag || [];
		}

		// Приводим разные API к единому формату { label, value }
		return list.map(elem => ({
			label: source.remoteType === SOURCE_TYPES.GELBOORU ? `${elem.name} (${elem.count})` : elem.label,
			value: source.remoteType === SOURCE_TYPES.GELBOORU ? elem.name : elem.value
		}));
	} catch (e) {
		console.error("Autocomplete error", e);
		return [];
	}
}