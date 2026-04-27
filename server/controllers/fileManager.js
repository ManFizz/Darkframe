const fs = require('fs');
const path = require('path');
const https = require('https');

function ensureDirectoryExists(filePath) {
	const dirname = path.dirname(filePath);
	if (fs.existsSync(dirname)) {
		return true;
	}
	ensureDirectoryExists(dirname);
	fs.mkdirSync(dirname);
}

function downloadFile(url, pathForDownload) {
	const fileName = path.basename(url);
	const fullPath = path.join(pathForDownload, fileName);

	ensureDirectoryExists(fullPath);

	const file = fs.createWriteStream(fullPath);

	return new Promise((resolve, reject) => {
		https.get(url, (response) => {
			if (response.statusCode !== 200) {
				reject(new Error(`Failed to download, response status code: ${response.statusCode}`));
				return;
			}

			response.pipe(file);

			file.on('finish', () => {
				file.close();
				resolve(fullPath);
			});
		}).on('error', (err) => {
			fs.unlink(fullPath, () => reject(err));
		});

		file.on('error', (err) => {
			fs.unlink(fullPath, () => reject(err));
		});
	});
}


function deleteFile(path) {
	fs.unlink(path, (err) => {
		if (err) {
			console.error('Ошибка при удалении файла:', err);
		}
	});
}

function findFile(dir, filename) {
	const files = fs.readdirSync(dir);
	for (let file of files) {
		const fullPath = path.join(dir, file);
		if (file === filename) {
			return fullPath;
		} else if (fs.statSync(fullPath).isDirectory()) {
			let found = findFile(fullPath, filename);
			if (found) return found;
		}
	}
	return null;
}

module.exports = {downloadFile, deleteFile, findFile};