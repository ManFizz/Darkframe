const fs   = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const { getActive } = require('./libraryRegistry');

function customLogger(message) {
    if (!message.includes('SELECT ') && !message.includes('PRAGMA INDEX_LIST')) {
        fs.appendFileSync('sequelize.log', message + '\n');
    }
}

const active = getActive();
const dbFilePath = active.dbPath;

fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
if (!fs.existsSync(dbFilePath)) {
    fs.closeSync(fs.openSync(dbFilePath, 'w'));
}

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbFilePath,
    pool: { max: 1, min: 0, acquire: 30000, idle: 10000 },
    logging: customLogger,
});

module.exports = sequelize;
