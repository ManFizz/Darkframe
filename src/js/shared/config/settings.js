// Renderer view of data/settings.js (defaults + overrides, read by the preload);
// saved changes are merged into it by liveConfig.js. A copy: objects from the
// context bridge can't take new keys, and a setting saved the first time is one.
export default { ...window.darkframe.config.settings };
