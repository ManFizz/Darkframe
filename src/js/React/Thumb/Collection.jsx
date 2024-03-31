import React, {Component} from "react";
import { DisplayCollection } from "../../CollectionLogic";
import { getCollections } from "../../AppInitializer";

const pathToImage = "images/empty_collection.png";

function findFirst(array, condition) {
	for (let item of array) {
		if (condition(item)) {
			return item;
		}
	}
	return null;
}

class Collection extends Component {
	render() {
		const { file } = this.props;
		console.log(getCollections());
		const collection = getCollections().find(col => file.collectionId === col.id);
		if(!collection) {
			console.error("getCollections error in display");
			return null;
		}
		return <div className="card thumb bg-dark" onClick={() => {DisplayCollection(collection)}}>
			<img src={pathToImage} alt={file.title}/>
			<p className="title">{file.title}</p>
		</div>;
	}
}

export default Collection;