// Remembers the last applied image edit (rotate/flip/crop) so it can be re-applied
// to other images in one click — handy for batches with identical black bars / size.
const KEY = 'jsg_last_image_edit';

export function saveEditPreset(preset) {
    try { localStorage.setItem(KEY, JSON.stringify(preset)); } catch { /* ignore */ }
}

export function loadEditPreset() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch { return null; }
}
