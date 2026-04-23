const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin');
module.exports = {
    target: "electron-renderer",
    mode: 'production',
    devtool: 'source-map',
    entry: './webpack.imports.js',
    optimization: {
        splitChunks: {
            chunks: 'all',
        },
        usedExports: true,
        minimize: true,
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
        filename: 'bundle.js',
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
        extensions: ['.js', '.jsx']
    },
};