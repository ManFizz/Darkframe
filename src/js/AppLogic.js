import Settings from "../../data/settings";
import { updateR34Source } from "./r34";
import { setGallery } from "./AppInitializer";

export const SORT_ORDER = {
	ASC: 1,
	DESC: -1,
}

export const SORT_TYPE = {
	NAME: 0,
	TIME: 1,
}

export function updateMainArray(newArray) {
	const { displayArray, sortInfo } = this.state;
	const sortedArray = [...newArray].sort((a, b) => {
		if (a.priority !== b.priority) {
			return b.priority - a.priority;
		}

		if (sortInfo.type === SORT_TYPE.NAME) {
			return a.title.toLowerCase().localeCompare(b.title.toLowerCase()) * sortInfo.order;
		}

		if (sortInfo.type === SORT_TYPE.TIME) {
			return sortInfo.order * (a.time - b.time);
		}

		return 0;
	});

	let startPost = sortedArray.indexOf(displayArray[0]);
	if (startPost === -1) {
		startPost = 0;
	}

	this.setState({
		displayArray: sortedArray.slice(startPost, startPost + Settings.maxThumbsPerPage),
		mainArray: sortedArray
	});
}

export function setSource(source) {
	updateR34Source(source);
	this.setState({currentSource: source});
}

export function setTypeView(newTypeView) {
	const minView = 1;
	const maxView = 3;
	const {typeView} = this.state;
	if (newTypeView === null)
		newTypeView = typeView + 1 <= maxView ? typeView + 1 : minView;

	this.setState({typeView: newTypeView});
}

export function setSortInfo({order, type}) {
	const info = this.state.sortInfo;
	if (order !== undefined) info.order = order;
	if (type !== undefined) info.type = type;
	this.setState({sortInfo: info});
	setGallery(this.state.mainArray);
}