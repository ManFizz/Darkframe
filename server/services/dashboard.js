const { QueryTypes } = require('sequelize');
const sequelize = require('../database');
const tagAdmin = require('./tagAdmin');

// One aggregated snapshot of the library for the stats dashboard. Everything is
// computed in a handful of grouped SQL passes rather than by loading rows, so it
// stays cheap even on large libraries.
async function getDashboard() {
    // Overview + type split + totals, in a single scan of the live items.
    const [overview] = await sequelize.query(
        `SELECT
            COUNT(*)                                                            AS total,
            COALESCE(SUM(size), 0)                                              AS totalSize,
            COALESCE(SUM(duration), 0)                                          AS totalDuration,
            SUM(CASE WHEN mimeType LIKE 'video/%' THEN 1 ELSE 0 END)            AS videos,
            SUM(CASE WHEN mimeType = 'image/gif' THEN 1 ELSE 0 END)             AS gifs,
            SUM(CASE WHEN mimeType LIKE 'image/%'
                      AND mimeType <> 'image/gif' THEN 1 ELSE 0 END)            AS images,
            SUM(CASE WHEN collectionId IS NULL THEN 1 ELSE 0 END)               AS uncategorized,
            SUM(CASE WHEN rating > 0 THEN 1 ELSE 0 END)                         AS rated,
            SUM(CASE WHEN editedAt IS NOT NULL THEN 1 ELSE 0 END)               AS edited
         FROM Items WHERE deletedAt IS NULL`,
        { type: QueryTypes.SELECT },
    );

    // Rating histogram, 0..10 (0 = unrated).
    const ratingRows = await sequelize.query(
        `SELECT rating, COUNT(*) AS count FROM Items
         WHERE deletedAt IS NULL GROUP BY rating`,
        { type: QueryTypes.SELECT },
    );
    const ratingDistribution = Array(11).fill(0);
    let ratingSum = 0;
    for (const r of ratingRows) {
        const idx = Math.max(0, Math.min(10, r.rating || 0));
        ratingDistribution[idx] += r.count;
        ratingSum += (r.rating || 0) * r.count;
    }
    const avgRating = overview.rated ? ratingSum / overview.rated : 0;

    // Trash (count + reclaimable size).
    const [trash] = await sequelize.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS size
         FROM Items WHERE deletedAt IS NOT NULL`,
        { type: QueryTypes.SELECT },
    );

    const [{ count: collectionsCount }] = await sequelize.query(
        `SELECT COUNT(*) AS count FROM Collections WHERE isSystem = 0`,
        { type: QueryTypes.SELECT },
    );

    // Items added per month (unix seconds → YYYY-MM), chronological.
    const timeline = await sequelize.query(
        `SELECT strftime('%Y-%m', datetime(importedAt, 'unixepoch')) AS month,
                COUNT(*) AS count
         FROM Items
         WHERE deletedAt IS NULL AND importedAt IS NOT NULL
         GROUP BY month ORDER BY month`,
        { type: QueryTypes.SELECT },
    );

    // Biggest files on disk.
    const largest = await sequelize.query(
        `SELECT id, title, fileName, size, mimeType FROM Items
         WHERE deletedAt IS NULL ORDER BY size DESC LIMIT 8`,
        { type: QueryTypes.SELECT },
    );

    // Tags: reuse the manager's counted listing (already ordered by usage).
    const allTags = await tagAdmin.getAllTags();
    const usedTags = allTags.filter(t => t.count > 0);

    return {
        total:         overview.total,
        images:        overview.images,
        videos:        overview.videos,
        gifs:          overview.gifs,
        totalSize:     overview.totalSize,
        totalDuration: overview.totalDuration,
        uncategorized: overview.uncategorized,
        edited:        overview.edited,
        rated:         overview.rated,
        unrated:       overview.total - overview.rated,
        avgRating,
        ratingDistribution,
        trashCount:       trash.count,
        trashSize:        trash.size,
        collectionsCount,
        tagsCount:        usedTags.length,
        tagsTotal:        allTags.length,
        topTags:          usedTags.slice(0, 20),
        timeline,
        largest,
    };
}

module.exports = { getDashboard };
