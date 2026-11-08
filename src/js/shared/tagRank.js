/**
 * Ranks tag suggestions by how well they match what's typed, so "overwa" puts
 * `overwatch` before `ashe_(overwatch)`:
 *
 *   0 the whole name · 1 the name starts with it · 2 a word in it starts with it
 *   (after _ ( : - …) · 3 somewhere inside · 4 / 5 with a typo, at the start /
 *   elsewhere · Infinity — no match.
 *
 * Ties go to pinned tags, then to the more used ones, then to the shorter name.
 * Spaces and underscores count as the same thing.
 */
const norm = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '_');

// Typos allowed for a query of this length.
const allowedTypos = (n) => (n < 4 ? 0 : n < 8 ? 1 : 2);

// Fewest edits (insert / delete / replace / swap of neighbours) turning `q` into
// some piece of `s`; with `atStart` the piece must begin the string.
function fuzzyDistance(q, s, atStart) {
    const n = q.length, m = s.length;
    let prev2 = null;
    let prev = new Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = atStart ? j : 0;
    for (let i = 1; i <= n; i++) {
        const cur = new Array(m + 1);
        cur[0] = i;
        for (let j = 1; j <= m; j++) {
            const cost = q[i - 1] === s[j - 1] ? 0 : 1;
            let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            if (prev2 && i > 1 && j > 1 && q[i - 1] === s[j - 2] && q[i - 2] === s[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
            cur[j] = v;
        }
        prev2 = prev;
        prev = cur;
    }
    return Math.min(...prev);   // the piece may end anywhere
}

const WORD_START = /[_()\-:/.,'!]/;

function matchScore(name, query) {
    const s = norm(name), q = norm(query).replace(/^[-!]/, '');
    if (!q) return 3;
    if (s === q) return 0;
    if (s.startsWith(q)) return 1;
    let at = s.indexOf(q);
    if (at > 0) {
        for (; at > 0; at = s.indexOf(q, at + 1)) if (WORD_START.test(s[at - 1])) return 2;
        return 3;
    }
    const typos = allowedTypos(q.length);
    if (!typos) return Infinity;
    if (fuzzyDistance(q, s, true) <= typos) return 4;
    if (fuzzyDistance(q, s, false) <= typos) return 5;
    return Infinity;
}

/**
 * Sorts (a copy of) `tags` best match first and drops the ones that don't match,
 * or, with `keep`, puts them last in their own order (a site's suggestions may
 * match by an alias). `name` / `count` / `pinned` read those from an entry.
 */
function rankTags(tags, query, {
    name = (t) => t.name,
    count = (t) => Number(t.count) || 0,
    pinned = (t) => !!t.pinned,
    keep = false,
} = {}) {
    return tags
        .map((t, i) => ({ t, i, score: matchScore(name(t), query) }))
        .filter(x => keep || x.score !== Infinity)
        .sort((a, b) =>
            (a.score === Infinity) - (b.score === Infinity)
            || (a.score === Infinity && b.score === Infinity ? a.i - b.i : 0)
            || a.score - b.score
            || (pinned(b.t) ? 1 : 0) - (pinned(a.t) ? 1 : 0)
            || count(b.t) - count(a.t)
            || norm(name(a.t)).length - norm(name(b.t)).length
            || a.i - b.i)
        .map(x => x.t);
}

module.exports = { matchScore, rankTags, fuzzyDistance, allowedTypos };
