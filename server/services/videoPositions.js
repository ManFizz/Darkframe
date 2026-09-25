const VideoPosition = require('../models/VideoPosition');

// Positions this close to either end aren't worth resuming — drop them instead.
const MIN_POSITION = 5;        // seconds
const END_FRACTION = 0.95;     // of the duration

async function getPosition({ section, key } = {}) {
    if (section == null || !key) return null;
    const row = await VideoPosition.findOne({ where: { section, key } });
    return row ? { position: row.position, duration: row.duration } : null;
}

async function savePosition({ section, key, position, duration } = {}) {
    if (section == null || !key) return { ok: false };
    position = Number(position) || 0;
    duration = Number(duration) || null;

    const finished = duration && position >= duration * END_FRACTION;
    if (position < MIN_POSITION || finished) {
        await VideoPosition.destroy({ where: { section, key } });
        return { ok: true, cleared: true };
    }

    const now = Math.floor(Date.now() / 1000);
    const existing = await VideoPosition.findOne({ where: { section, key } });
    if (existing) await existing.update({ position, duration, updatedAt: now });
    else await VideoPosition.create({ section, key, position, duration, updatedAt: now });
    return { ok: true };
}

module.exports = { getPosition, savePosition };
