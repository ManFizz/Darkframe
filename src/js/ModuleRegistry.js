const registry = {
    _modules: [],

    register(module) {
        this._modules.push(module);
    },

    getNavItems() {
        return this._modules.flatMap(m => m.navItems ?? []);
    },

    getSidebarSection(sourceType) {
        for (const m of this._modules) {
            if (m.sidebarSection && m.sourceTypes.includes(sourceType)) {
                return m.sidebarSection;
            }
        }
        return null;
    },

    onSourceChange(sourceType) {
        this._modules.forEach(m => m.onSourceChange?.(sourceType));
    },
};

export default registry;