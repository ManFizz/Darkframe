const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin');
// The window is a plain web page (contextIsolation, no Node) — see preload.js.
// No eval-based source maps: the CSP forbids eval.
module.exports = (env, argv) => ({
    target: 'web',
    mode: argv.mode || 'production',
    devtool: argv.mode === 'development' ? 'cheap-module-source-map' : false,
    entry: './webpack.imports.js',
    // A desktop app loads from disk — web bundle-size hints don't apply.
    performance: { hints: false },
    optimization: {
        splitChunks: {
            chunks: 'all',
        },
        usedExports: true,
        minimize: argv.mode !== 'development',
    },
    module: {
        rules: [
            {
                test: /\.(png|jpe?g|gif|webp|svg)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'images/[name][ext]',
                },
            },
            {
                "test": /\.css$/,
                use: [ 'style-loader', 'css-loader' ]
            },
            {
                test: /\.js$/,
                use: 'babel-loader'
            },
            {
                test: /\.jsx$/,
                use: 'babel-loader'
            },
            {
                "test": /\.html$/,
                use: ['html-loader'],
            }
        ]
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].bundle.js',
        // Wipe stale chunks from previous builds (chunk ids change between builds).
        clean: true,
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/html/index.html',
            chunks: ['main'],
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'public', to: '.' },
            ],
        }),
    ],
    resolve: {
        extensions: ['.js', '.jsx'],
        alias: {
            '@': path.resolve(__dirname, 'src/js'),
            // The page reads the config from the preload, not from disk.
            '@data/settings$': path.resolve(__dirname, 'src/js/shared/config/settings.js'),
            '@data/private$': path.resolve(__dirname, 'src/js/shared/config/private.js'),
            '@data': path.resolve(__dirname, 'data'),
            '@server': path.resolve(__dirname, 'server'),
            '@react': path.resolve(__dirname, 'src/js/React'),
            '@hooks': path.resolve(__dirname, 'src/js/Hooks'),
            '@services': path.resolve(__dirname, 'src/js/Services'),
            '@controllers': path.resolve(__dirname, 'src/js/Controllers'),
            '@modules': path.resolve(__dirname, 'src/js/modules'),
        }
    },
});
