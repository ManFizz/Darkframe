const {ipcMain} = require("electron");
const fs = require("fs");

function readDir(dir, timeKey = 'mtime') {
	return fs.readdirSync(dir).map(name => {
		const stats = fs.statSync(`${dir}/${name}`);
		return {
			name,
			time: stats[timeKey].getTime(),
			isDir: stats.isDirectory(),
		};
	});
}

function registerHandlers() {
	ipcMain.handle("getDirFiles", (event, dir) => {
		if(!fs.existsSync(dir))
			return null;

		let files = readDir(dir);
		return files != null ? JSON.stringify(files) : null;
	});
}

module.exports = { registerHandlers };