/**
 * Moves one item next to another (before it, or after it with `after`). Returns the
 * same array when nothing would change, so callers can skip saving.
 */
function moveItem(items, draggedId, targetId, after = false) {
    if (draggedId === targetId) return items;
    const dragged = items.find(f => f.uniqueId === draggedId);
    if (!dragged || !items.some(f => f.uniqueId === targetId)) return items;

    const rest = items.filter(f => f !== dragged);
    const at = rest.findIndex(f => f.uniqueId === targetId) + (after ? 1 : 0);
    rest.splice(at, 0, dragged);
    return rest.every((f, i) => f === items[i]) ? items : rest;
}

module.exports = { moveItem };
