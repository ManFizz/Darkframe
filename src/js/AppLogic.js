import {SOURCE_TYPES} from "./ThumbFile";
import {getCurrentSource} from "./AppInitializer";

export const SORT_ORDER = { ASC: 1, DESC: -1 };
export const SORT_TYPE = { NAME: 0, TIME: 1 };

const SORT_STRATEGIES = {
	[SORT_TYPE.NAME]: (a, b) => {
		const titleA = a.title?.toLowerCase() || "";
		const titleB = b.title?.toLowerCase() || "";
		return titleA.localeCompare(titleB);
	},
	[SORT_TYPE.TIME]: (a, b) => (a.time || 0) - (b.time || 0),
	[SORT_TYPE.PRIORITY]: (a, b) => (a.priority || 0) - (b.priority || 0),
};

export function getSortedArray(array, sortInfo) {
	if (!Array.isArray(array)) {
		return [];
	}

	if(getCurrentSource() === SOURCE_TYPES.FAVORITE) {
		return [...array].sort((a, b) => ((a.id - b.id) * sortInfo.order));
	}

	if(getCurrentSource() === SOURCE_TYPES.FOLDER) {
		return [...array].sort((a, b) => {
			if (a.priority !== b.priority) {
				return (b.priority || 0) - (a.priority || 0);
			}

			const strategy = SORT_STRATEGIES[sortInfo.type];
			let result = strategy ? strategy(a, b) : 0;

			result *= (sortInfo.order || 1);

			if (result === 0) {
				const idA = String(a.uniqueId || "");
				const idB = String(b.uniqueId || "");
				return idA.localeCompare(idB);
			}

			return result;
		});
	}

	return array;
}

export function getNextViewType(currentType) {
	const minView = 1;
	const maxView = 3;
	return currentType + 1 <= maxView ? currentType + 1 : minView;
}

export function getTypeView(newTypeView) {
	const minView = 1;
	const maxView = 3;
	const {typeView} = this.state;
	if (newTypeView === null)
		newTypeView = typeView + 1 <= maxView ? typeView + 1 : minView;

	this.setState({typeView: newTypeView});
}