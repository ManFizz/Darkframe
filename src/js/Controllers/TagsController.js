import {GetSourceDataById, sources} from "./R34Controller";
import {SOURCE_TYPES} from "../Constants";
import PrivateData from "../../../data/private";
import {getTagsByNames, SaveTags} from "../backend";

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
	0: 30,
	1: 1,
	2: 5,
	3: 15,
	4: 20,
	5: 45,
	6: 40,
};

export const getTagOrder = (type) => TAG_PRIORITY[type] ?? 99;

const MAX_CACHE_SIZE = 10000;
const tagsMap = new Map();

function setTagToCache(tag) {
	if (!tag || !tag.name) return;

	if (tagsMap.size >= MAX_CACHE_SIZE) {
		const firstKey = tagsMap.keys().next().value;
		tagsMap.delete(firstKey);
	}

	tagsMap.set(tag.name, tag);
}

const dirtyTags = new Set();

function markDirty(tag) {
	if (tag?.name) {
		dirtyTags.add(tag.name);
	}
}

const pendingTags = new Map();
let isFetching = false;
let listeners = [];
let updateTimeout = null;

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
		if (!tag || tagsMap.has(tag) || pendingTags.has(tag)) return;
		pendingTags.set(tag, sourceType);
	});

	if (!isFetching) {
		processQueue();
	}
}

async function processQueue() {
	if (pendingTags.size === 0) return;

	isFetching = true;

	const batch = Array.from(pendingTags.entries()).slice(0, 20);
	batch.forEach(([name]) => pendingTags.delete(name));

	const names = batch.map(([name]) => name);

	let dbTags = [];
	let foundInDb = new Set();

	try {
		dbTags = await getTagsByNames(names);

		if (Array.isArray(dbTags)) {
			dbTags.forEach(tag => {
				setTagToCache(tag);
				foundInDb.add(tag.name);
			});
		}
	} catch (e) {
		console.warn("SQLite batch fetch failed:", e);
	}

	const missing = batch.filter(([name]) => !foundInDb.has(name));

	const results = await Promise.all(
		missing.map(([name, sourceType]) =>
			fetchTagInfo({ name, sourceType })
		)
	);

	updateTags(results.filter(Boolean));

	isFetching = false;

	triggerUpdate();

	if (pendingTags.size > 0) {
		setTimeout(processQueue, 200);
	}
}

/* ---------------- ENCODE ---------------- */

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
		if (sourceType !== SOURCE_TYPES.R34) return null;

		const url =
			`${sources.r34.tagsUrl}${encodeTag(name)}` +
			`&api_key=${R34ApiKey}&user_id=${R34UserId}`;

		const res = await fetch(url);
		const text = await res.text();

		const parser = new DOMParser();
		const xml = parser.parseFromString(text, "text/xml");
		const tagNode = xml.querySelector("tag");

		if (!tagNode) return null;

		const tag = new Tag({
			id: null,
			name: tagNode.getAttribute("name"),
			type: Number(tagNode.getAttribute("type")),
			count: Number(tagNode.getAttribute("count")),
			remoteType: sourceType
		});

		if (!tag.name || tag.type == null || tag.count == null) {
			console.warn("Invalid tag:", name);
			return null;
		}

		setTagToCache(tag);
		return tag;

	} catch (e) {
		console.warn("Tag fetch error:", name, e);
		return null;
	}
}

function triggerUpdate() {
	clearTimeout(updateTimeout);

	updateTimeout = setTimeout(() => {
		listeners.forEach(cb => cb());
	}, 100);
}

export function updateTags(newTags = []) {
	let hasChanges = false;

	newTags.forEach(tag => {
		if (!tag?.name) return;

		const existing = tagsMap.get(tag.name);

		if (!existing) {
			setTagToCache(tag);
			markDirty(tag);
			hasChanges = true;
		} else {
			if (!existing.type && tag.type) {
				existing.type = tag.type;
				hasChanges = true;
				markDirty(existing);
			}

			if (tag.count && tag.count !== existing.count) {
				existing.count = tag.count;
				hasChanges = true;
				markDirty(existing);
			}
		}
	});

	if (hasChanges) {
		scheduleSave();
		triggerUpdate();
	}
}

let saveTimeout = null;

function scheduleSave() {
	if (saveTimeout) clearTimeout(saveTimeout);

	saveTimeout = setTimeout(() => {
		const tagsToSave = Array.from(dirtyTags)
			.map(name => tagsMap.get(name))
			.filter(Boolean);

		if (tagsToSave.length > 0) {
			SaveTags(tagsToSave);
			dirtyTags.clear();
		}
	}, 1000);
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

	const sourceData = GetSourceDataById(sourceId);

	try {
		const url =
			sourceData.tagUrl +
			lastWord +
			(sourceData.remoteType === SOURCE_TYPES.R34 ? "" : "%");

		const res = await fetch(url);
		let data = await res.json();

		if (sourceData.remoteType === SOURCE_TYPES.GELBOORU) {
			data = data.tag || [];
		}

		const normalized = data.map(t => ({
			name: t.name || t.value,
			count: t.count || 0,
			type: t.type ?? null,
			label:
				sourceData.remoteType === SOURCE_TYPES.GELBOORU
					? `${t.name} (${t.count})`
					: t.label,
			value: t.name || t.value
		}));

		suggestionsCache.set(lastWord, normalized);

		return normalized;
	} catch (e) {
		console.error("Tag suggestions error:", e);
		return [];
	}
}

export function normalizeTags(tags) {
	if (!tags) return [];

	let result;

	if (Array.isArray(tags)) {
		result = tags;
	} else if (typeof tags === "string") {
		result = tags.trim().split(/[\s,]+/)
	} else {
		return [];
	}

	return [...new Set(
		result
			.map(t => (t || "").toString().trim().toLowerCase())
			.filter(t => t.length > 0)
	)];
}