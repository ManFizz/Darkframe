const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function backupDatabase() {
	const sourceFilePath = '../data/data.db';
	const backupFolderPath = '../data/backup/';

	const needDelete = false;

	const currentDate = new Date();
	const timestamp = currentDate.toISOString().replace(/[:]/g, '-').split('.')[0];
	const backupFileName = `data_${timestamp}.db.bak`;

	const sourceFile = path.resolve(__dirname, sourceFilePath);
	const backupFolder = path.resolve(__dirname, backupFolderPath);
	const backupFilePath = path.join(backupFolder, backupFileName);

	// Создание папки для бэкапа, если она не существует
	if (!fs.existsSync(backupFolder)) {
		fs.mkdirSync(backupFolder);
	}

	// Функция для вычисления хеша файла
	function calculateFileHash(filePath) {
		const hash = crypto.createHash('sha256');
		const fileData = fs.readFileSync(filePath);
		return hash.update(fileData).digest('hex');
	}

	// Получение хеша текущего файла
	const currentFileHash = calculateFileHash(sourceFile);

	// Получение хеша последнего бэкапа (если он существует)
	let lastBackupHash = null;
	const lastBackupFiles = fs.readdirSync(backupFolder);
	if (lastBackupFiles.length > 0) {
		const lastBackupFile = path.join(backupFolder, lastBackupFiles[lastBackupFiles.length - 1]);
		lastBackupHash = calculateFileHash(lastBackupFile);
	}

	// Сравнение хешей текущего файла и последнего бэкапа
	if (lastBackupHash === currentFileHash) {
		console.log('Текущий файл не отличается от последнего бэкапа. Создание нового бэкапа не требуется.');
	} else {
		// Копирование файла в папку для бэкапа
		fs.copyFile(sourceFile, backupFilePath, (err) => {
			if (err) {
				console.error('Ошибка при создании бэкапа:', err);
				return;
			}
			console.log('Бэкап успешно создан:', backupFilePath);

			if(needDelete) {
				// Удаление старых бэкапов (больше месяца)
				if (fs.existsSync(backupFolder)) {
					const monthAgo = new Date();
					monthAgo.setMonth(monthAgo.getMonth() - 1);
					const files = fs.readdirSync(backupFolder);
					files.forEach((file) => {
						const filePath = path.join(backupFolder, file);
						const stats = fs.statSync(filePath);
						if (stats.isFile() && stats.birthtime < monthAgo) {
							fs.unlinkSync(filePath);
							console.log('Старый бэкап удален:', filePath);
						}
					});

					// Удаление лишних бэкапов (больше 20)
					const backupFiles = fs.readdirSync(backupFolder);
					if (backupFiles.length > 20) {
						const sortedFiles = backupFiles
							.map((file) => ({
								name: file,
								birthtime: fs.statSync(path.join(backupFolder, file)).birthtime,
							}))
							.sort((a, b) => b.birthtime - a.birthtime);

						const filesToDelete = sortedFiles.slice(20);
						filesToDelete.forEach((file) => {
							fs.unlinkSync(path.join(backupFolder, file.name));
							console.log('Лишний бэкап удален:', file.name);
						});
					}
				}
			}
		});
	}
}

module.exports = { backupDatabase };