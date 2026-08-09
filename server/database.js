const fs   = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const { getActive } = require('./libraryRegistry');

// Writing to sequelize.log on every query is synchronous disk I/O in the main
// process and the file grows without bound — off by default, opt in with
// JSG_SQL_LOG=1 when actually debugging SQL.
const SQL_LOG = process.env.JSG_SQL_LOG === '1';

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
    logging: SQL_LOG ? customLogger : false,
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
