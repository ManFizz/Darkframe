// server/services/eagleImportService.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { importFile } = require('./importService');

function parseEagleCsv(csvPath) {
    const content = fs.readFileSync(csvPath, 'utf-8');

    const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true, // на случай UTF-8 BOM
    });

    return records.map(row => ({
        eagleId:    row['ID'],
        title:      row['Name'],
        extension:  row['Extension'],
        width:      parseInt(row['Width']) || 0,
        height:     parseInt(row['Height']) || 0,
        duration:   parseFloat(row['Duration']) || null,
        sourceUrl:  row['URL'] || '',
        notes:      row['Annotation'] || '',
        tags:       row['Tags']
            ? row['Tags'].split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
            : [],
        size:       parseInt(row['Size']) || 0,
        rating:     parseInt(row['Rating']) || 0,
        filePath:   row['File Path'],
        importedAt: row['Imported At']
            ? Math.floor(new Date(row['Imported At']).getTime() / 1000)
            : null,
    }));
}

async function importFromEagleCsv({ csvPath, collectionId = null, webContents }) {
    const rows = parseEagleCsv(csvPath);
    const total = rows.length;

    const results = [];
    const skipped = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Шлём прогресс на фронт
        webContents?.send('library:importProgress', {
            current: i + 1,
            total,
            title: row.title,
        });

        if (!row.filePath || !fs.existsSync(row.filePath)) {
            errors.push({ title: row.title, error: 'File not found' });
            continue;
        }

        try {
            const result = await importFile({
                filePath: row.filePath,
                collectionId,
                tags: row.tags,
                sourceUrl: row.sourceUrl,
                overrides: {
                    title:      row.title,
                    width:      row.width,
                    height:     row.height,
                    duration:   row.duration,
                    size:       row.size,
                    rating:     row.rating,
                    notes:      row.notes,
                    importedAt: row.importedAt,
                },
            });

            result.skipped ? skipped.push(result) : results.push(result);
        } catch (e) {
            errors.push({ title: row.title, error: e.message });
        }
    }

    webContents?.send('library:importProgress', {
        current: total,
        total,
        done: true,
    });

    return { results, skipped, errors, total };
}

module.exports = { importFromEagleCsv, parseEagleCsv };