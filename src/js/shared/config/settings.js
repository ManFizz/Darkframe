// Renderer view of data/settings.js: the preload reads the file (defaults +
// overrides) and hands over a plain copy. Saved changes are merged into this same
// object by liveConfig.js.
// A copy: objects that come over the context bridge can't take new keys, and a
// setting saved for the first time (not in data/settings.js yet) is one.
export default { ...window.darkframe.config.settings };
