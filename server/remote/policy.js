/**
 * What a remote device may call.
 *
 * PC-only — never over the network: system dialogs, the computer's disks and
 * clipboard, windows that open on the desktop, app settings, access tokens,
 * switching libraries, the device list itself.
 *
 * "view" devices additionally can't change anything (ratings, tags, moves,
 * deletions, downloads…); only their own reading / watching progress is saved.
 */
const PC_ONLY = [
    /Dialog$/, /:pickDir$/, /:pickFolder$/,
    /^apitokens:/, /^config:save$/, /^library:registry:(?!list$)/, /^watch:(?!list$)/, /^fs:/, /^remote:/,
    /^library:revealItem$/, /^shell:/, /^drag:/, /^danbooru:verify$/,
    /^library:paste$/,
    // These take paths on the PC's disk; a phone uploads files instead.
    /^library:importFiles$/, /^library:importDirectory$/, /^library:importFromEagle$/, /^library:importFromJson$/,
    /^manga:importFolder$/, /^manga:importArchives$/, /^manga:fromFiles$/, /^manga:planFolder$/,
    /^manga:exportCbz$/, /^manga:exportFolder$/,
    /^manga:login$/, /^manga:openSite$/, /^manga:setSubsConfig$/,
    /^autotag:download$/, /^autotag:remove$/, /^autotag:settings$/,
];

const VIEW_ALLOWED_WRITES = new Set([
    'library:recordView', 'library:saveVideoPosition', 'manga:saveProgress', 'manga:setSeen', 'net:abort',
]);
const MUTATING = /(save|update|delete|remove|trash|purge|import|edit|move|rename|create|set[A-Z]|add|split|merge|revert|recompress|trim|restore|empty|reorder|clear|undo|redo|download|apply|duplicate|record|capture|compute|generate|cleanup|pin|reset|fromItems|from[A-Z])/;

function allowed(channel, access) {
    if (PC_ONLY.some(re => re.test(channel))) return { ok: false, reason: 'Это действие доступно только на компьютере' };
    if (access === 'view') {
        const action = channel.split(':').pop();
        if (!VIEW_ALLOWED_WRITES.has(channel) && MUTATING.test(action)) return { ok: false, reason: 'У этого устройства доступ только для просмотра' };
    }
    return { ok: true };
}

module.exports = { allowed, PC_ONLY };
