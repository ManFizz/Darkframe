import React, {Component} from "react";
import {Dropdown} from 'react-bootstrap';
import {getCollections, setCollections} from "../../Controllers/AppInitializerController";

class DropMenu extends Component {
	constructor(props) {
		super(props);
		this.state = {
			isOpen: false
		};
	}

	handleClick = (e) => {
		e.stopPropagation();
		this.setState({ isOpen: !this.state.isOpen });
	}

	onItemClick = (e, id) => {
		e.stopPropagation();

		const collections = getCollections();
		collections.find(col => col.id === id).addImage(this.props.file)
		setCollections(collections);
	}

	render() {
		const { isOpen } = this.state;
		const { file } = this.props;
		if(file._fav === false)
			return null;
		const collections = getCollections();
		return (
			<Dropdown drop="up">
				<div
					onClick={this.handleClick}
					aria-expanded={isOpen ? 'true' : 'false'}
				>
					<i className="bi bi-collection" />
				</div>
				<Dropdown.Menu show={isOpen}>
					{collections.map(col =>
						<Dropdown.Item key={col.id} onClick={(e) => this.onItemClick(e, col.id)}>{col.name}</Dropdown.Item>
					)}
				</Dropdown.Menu>
			</Dropdown>
		);
	}
}

export default DropMenu;
