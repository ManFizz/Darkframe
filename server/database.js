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

// SQLite locks the whole file for writes. Without these two PRAGMAs any brush of
// contention (two saves overlapping, a read during a write) throws SQLITE_BUSY
// immediately. busy_timeout makes a blocked writer wait instead of erroring, and
// WAL lets reads proceed while a write is in flight. Applied to every pooled
// connection as it opens.
sequelize.afterConnect(async (connection) => {
    const run = (sql) => new Promise((resolve, reject) =>
        connection.run(sql, (err) => (err ? reject(err) : resolve())));
    await run('PRAGMA busy_timeout = 5000;');
    await run('PRAGMA journal_mode = WAL;');
});

module.exports = sequelize;
