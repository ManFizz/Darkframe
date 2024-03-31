import { GetCollections } from "./backend";
import { GetThumbByData } from "./GalleryController";
import { FILE_TYPES } from "./Display";
import { setCollections, setGallery } from "./AppInitializer";
import { favToDisplayFile } from "./FavController";

export function DisplayCollections() {
	GetCollections().then( res => {
		setCollections(res);

		let array = [];
		res.forEach(col => {
			const thumbFile = GetThumbByData({
				type: FILE_TYPES.COLLECTION,
				title: col.name,
				thumbUrl: col.name, //for keys in react
			});
			thumbFile.collectionId = col.id;
			array.push(thumbFile);
		});
		setGallery(array);
	});
}

export function DisplayCollection(collection) {
	setGallery(collection.images.map( favData => favToDisplayFile(favData) ));
}