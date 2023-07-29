const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

module.exports = {
    entry: "./src/app.js",
    mode: "development",
    output: {
        filename: "main.js",
        path: path.resolve(__dirname, "dist"),
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)?$/,
                include: path.resolve(__dirname, 'src'),
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            },
            {
                test: /\.(png|jpg|jpeg|glb)$/i,
                type: "asset/resource",
            },
            {
                // Embed your WGSL files as strings
                test: /\.wgsl$/i,
                type: "asset/source",
            }
        ]
    },
    plugins: [new HtmlWebpackPlugin({
        template: "./index.html",
    })],
};
