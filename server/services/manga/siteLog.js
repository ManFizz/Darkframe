const fs = require('fs');
const path = require('path');

/**
 * A small diagnostic log of the manga sites (userData/manga-site.log): hosts and
 * paths, page structure counts, cookie *names* — never query strings, cookie
 * values or page text. For finding out why a sign-in or a chapter doesn't work.
 */
function siteLog(line) {
    try {
        const file = path.join(require('electron').app.getPath('userData'), 'manga-site.log');
        try { if (fs.statSync(file).size > 256 * 1024) fs.rmSync(file); } catch { /* none yet */ }
        fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
    } catch { /* tests / no userData */ }
}

const bare = (u) => { try { const x = new URL(u); return `${x.host}${x.pathname}`; } catch { return '?'; } };

module.exports = { siteLog, bare };
