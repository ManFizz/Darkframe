const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack')

module.exports = {
    target: "electron-renderer",
    mode: 'development',
    entry: './src/js/index.js',
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [ 'style-loader', 'css-loader' ]
            },
            {
                test: /\.js$/,
                use: 'babel-loader'
            },
            {
                test: /\.html$/,
                use: ['html-loader'],
            },
            {
                test: /\.(png|jpe?g|gif)$/i,
                use: [
                    {
                        loader: 'url-loader',
                        options: {
                            limit: 102400, // 100 КБ
                            fallback: 'file-loader',
                        },
                    },
                ],
            },
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
                { from: 'public', to: '.' }, // Копировать все файлы из public в dist/public
            ],
        }),
    ],
};
