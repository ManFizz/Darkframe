import {GetSourceDataById, sources} from "./R34Controller";
import {SOURCE_TYPES} from "./Constants";
import PrivateData from "../../data/private";
import {SaveTags} from "./backend";

class Tag {
	constructor({ id, name, type, count, remoteType }) {
		this.id = id;
		this.name = name;
		this.type = type;
		this.remoteType = remoteType;
		this.count = count;
	}
}

const TAG_PRIORITY = {
	0: 30, //
	1: 1, // Artist
	2: 5, //
	3: 15, // Franchise
	4: 20, // Character
	5: 45, // Metadata
	6: 40, // Base tags
};

export const getTagOrder = (type) => {
	return TAG_PRIORITY[type] ?? 99;
};

let tagsLoaded = false;

export function initTagsFromDB(dbTags = []) {
	if (!Array.isArray(dbTags)) return;

	dbTags.forEach(tag => {
		if(tag.id === undefined || tag.id === null ||
			tag.name === undefined || tag.name === null ||
			tag.type === undefined || tag.type === null ||
			tag.count === undefined || tag.count === null
		) {
			console.error("Init Tag ", tag.name, " can't be load. Tag:", tag);
			return;
		}
		tagsMap.set(tag.name, tag);
	});

	tagsLoaded = true;
}

export function areTagsLoaded() {
	return tagsLoaded;
}

const tagsMap = new Map();
const pendingTags = new Set();

let isFetching = false;
let listeners = [];
let updateTimeout = null;

export function getTag(name) {
	return tagsMap.get(name);
}

export function getAllTags() {
	return Array.from(tagsMap.values());
}

export function subscribe(callback) {
	listeners.push(callback);
	return () => {
		listeners = listeners.filter(cb => cb !== callback);
	};
}

export function ensureTags(tags = [], sourceType = SOURCE_TYPES.R34) {
	if (!Array.isArray(tags)) return;

	tags.forEach(tag => {
		if (!tag || tagsMap.has(tag)) return;
		pendingTags.add({ name: tag, sourceType });
	});

	if (!isFetching) {
		processQueue();
	}
}

async function processQueue() {
	if (pendingTags.size === 0) return;

	isFetching = true;

	const batch = Array.from(pendingTags).slice(0, 15);

	batch.forEach(t => pendingTags.delete(t));

	const results = await Promise.all(batch.map(fetchTagInfo));
	updateTags(results.filter(Boolean));

	isFetching = false;

	triggerUpdate();

	if (pendingTags.size > 0) {
		setTimeout(processQueue, 200);
	}
}

function encodeTag(tag) {
	return tag
		.trim()
		.replace(/\s+/g, "_")          // space → _
		.replace(/'/g, "%27")          // ' → %27
		.replace(/"/g, "%22")          // " → %22
		.replace(/:/g, "%3A")          // : → %3A
		.replace(/\(/g, "%28")         // ( → %28
		.replace(/\)/g, "%29")         // ) → %29
		.replace(/\[/g, "%5B")         // [ → %5B
		.replace(/\]/g, "%5D")         // ] → %5D
		.replace(/&/g, "%26")          // & → %26
		.replace(/\+/g, "%2B");       // + → %2B
}

const { R34ApiKey, R34UserId } = PrivateData;
async function fetchTagInfo({ name, sourceType }) {
	try {

		if (sourceType !== SOURCE_TYPES.R34) return;

		const url = `${sources.r34.tagsUrl}${encodeTag(name)}&api_key=${R34ApiKey}&user_id=${R34UserId}`;

		const res = await fetch(url);
		const text = await res.text();

		const parser = new DOMParser();
		const xml = parser.parseFromString(text, "text/xml");
		const tagNode = xml.querySelector("tag");

		if (!tagNode) return;

		const tag = new Tag({
			id: null,
			name: tagNode.getAttribute("name"),
			type: Number(tagNode.getAttribute("type")),
			count: Number(tagNode.getAttribute("count")),
			remoteType: sourceType
		});

		if( tag.name === undefined || tag.name === null ||
			tag.type === undefined || tag.type === null ||
			tag.count === undefined || tag.count === null
		) {
			console.error("Tag ", name, " not batched. Url, result", url, res);
			return false;
		}

		tagsMap.set(tag.name, tag);
		return true;

	} catch (e) {
		console.warn("Tag fetch error:", name, e);
		return false;
	}
}

function triggerUpdate() {
	clearTimeout(updateTimeout);

	updateTimeout = setTimeout(() => {
		listeners.forEach(cb => cb());
	}, 100);
}

const suggestionsCache = new Map();

export async function fetchTagSuggestions(query, sourceId) {
	if (!query || query.length < 2) return [];

	const match = query.match(/[^ -][^ ]*$/);
	if (!match) return [];

	const lastWord = match[0].toLowerCase();

	if (suggestionsCache.has(lastWord)) {
		return suggestionsCache.get(lastWord);
	}

	let sourceData = GetSourceDataById(sourceId);
	try {
		const url =
			sourceData.tagUrl +
			lastWord +
			(sourceData.remoteType === SOURCE_TYPES.R34 ? "" : "%"); // R34 fix

		const res = await fetch(url);
		let data = await res.json();

		if (sourceData.remoteType === 4) {
			data = data.tag || [];
		}

		const normalized = data.map(t => ({
			name: t.name || t.value,
			count: t.count || 0,
			type: t.type ?? null,
			label:
				sourceData.remoteType === 4
					? `${t.name} (${t.count})`
					: t.label,
			value: t.name || t.value
		}));

		normalized.forEach(t => {
			if (!tagsMap.has(t.name)) {
				tagsMap.set(t.name, t);
			}
		});

		suggestionsCache.set(lastWord, normalized);

		return normalized;
	} catch (e) {
		console.error("Tag suggestions error:", e);
		return [];
	}
}

let saveTimeout = null;

function scheduleSave() {
	if (saveTimeout) clearTimeout(saveTimeout);

	saveTimeout = setTimeout(() => {
		SaveTags();
	}, 1000);
}

export function updateTags(newTags = []) {
	let hasChanges = false;

	newTags.forEach(tag => {
		const existing = tagsMap.get(tag.name);

		if (!existing) {
			tagsMap.set(tag.name, tag);
			hasChanges = true;
		} else {
			if (!existing.type && tag.type) {
				existing.type = tag.type;
				hasChanges = true;
			}
			if (tag.count && tag.count !== existing.count) {
				existing.count = tag.count;
				hasChanges = true;
			}
		}
	});

	if (hasChanges) {
		scheduleSave();
		triggerUpdate();
	}
}