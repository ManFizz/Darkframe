export class Collection {
	constructor(name, id, images = []) {
		this.id = id;
		this.name = name;
		this.images = images;
	}

	addImage(image) {
		this.images.push(image);
	}

	removeImage(image) {
		const index = this.images.indexOf(image);
		if (index !== -1) {
			this.images.splice(index, 1);
		}
	}
}

export default Collection;