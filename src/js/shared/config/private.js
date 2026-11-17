// Renderer view of data/private.js (API keys, start folder) — see settings.js.
// A copy: objects that come over the context bridge can't take new keys, and a
// setting saved for the first time (not in data/private.js yet) is one.
export default { ...window.darkframe.config.private };
