const {Sequelize} = require("sequelize");
const fs = require("fs");

const dbFilePath = 'data/data.db';

function customLogger(message) {
	if(!message.includes("SELECT ") && !message.includes("PRAGMA INDEX_LIST")) {}
		fs.appendFileSync('sequelize.log', message + '\n');
}

if (!fs.existsSync(dbFilePath)) {
	fs.closeSync(fs.openSync(dbFilePath, 'w'));
}

const sequelize = new Sequelize({
	dialect: 'sqlite',
	storage: dbFilePath,
	logging: customLogger,
});

sequelize.sync()
	.then(() => {
		console.log('All models were synchronized successfully.');
	})
	.catch(err => {
		console.error('An error occurred while synchronizing the models:', err);
	});

module.exports = sequelize;