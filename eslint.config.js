// ESLint: rules that catch mistakes (an undefined name, a hook called conditionally,
// a duplicate key, code that can't run), not formatting. `npm run lint`.
const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

const common = {
    ...js.configs.recommended.rules,
    'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-useless-escape': 'off',
    'no-control-regex': 'off',
    'no-prototype-builtins': 'off',
    'no-cond-assign': ['error', 'except-parens'],
};

module.exports = [
    // eslint-disable comments for rules not switched on here (exhaustive-deps) are fine.
    { linterOptions: { reportUnusedDisableDirectives: 'off' } },
    {
        ignores: [
            'dist/**', 'node_modules/**', 'data/**', 'cache/**', 'downloads/**',
            'scripts/**',            // the user's own userscripts, kept as they are
            'userscripts/dist/**',
            'src/css/**', 'public/**',
        ],
    },

    // Main process, tools, tests: Node, CommonJS.
    {
        files: ['main.js', 'preload.js', 'server/**/*.js', 'tools/**/*.js', 'test/**/*.js', 'userscripts/build.js', 'webpack.config.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: common,
    },

    // The window: React, ES modules, browser.
    {
        files: ['src/**/*.{js,jsx}'],
        plugins: { react, 'react-hooks': reactHooks },
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: { ...globals.browser },
        },
        settings: { react: { version: 'detect' } },
        rules: {
            ...common,
            'react/jsx-uses-vars': 'error',      // JSX use counts as use (no false "unused")
            'react/jsx-uses-react': 'error',
            'react/jsx-no-undef': 'error',
            'react/jsx-key': 'warn',
            'react/no-direct-mutation-state': 'error',
            'react-hooks/rules-of-hooks': 'error',
        },
    },

    // Modules shared by the window and the main process export with CommonJS;
    // webpack's entry file is an ES module.
    {
        files: ['src/js/shared/**/*.js'],
        languageOptions: { globals: { module: 'writable' } },
    },
    {
        files: ['webpack.imports.js'],
        languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    },

    // The browser userscript: CommonJS modules packed by userscripts/build.js, run
    // by Violentmonkey (GM_* functions).
    {
        files: ['userscripts/core/**/*.js', 'userscripts/sites/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'commonjs',
            globals: {
                ...globals.browser,
                module: 'writable', require: 'readonly',
                GM_xmlhttpRequest: 'readonly', GM_getValue: 'readonly', GM_setValue: 'readonly',
                GM_registerMenuCommand: 'readonly', GM_setClipboard: 'readonly',
            },
        },
        rules: common,
    },
];
