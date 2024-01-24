const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    mode: 'development',
    entry: {
        main: './src/js/main.js',
        r34: './src/js/r34.js',
        modal: './src/js/modal.js',
        backend: './src/js/backend.js',
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    target: 'electron-main',
    externals: [nodeExternals()],
    resolve: {
        fallback: {
            "path": require.resolve("path-browserify"),
        },
    },
};
