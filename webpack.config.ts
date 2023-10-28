import path from "path";
import webpack from "webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import HtmlWebpackTagsPlugin from "html-webpack-tags-plugin";
import 'webpack-dev-server';
import process from "process";

const isProduction = process.env["NODE_ENV"] === "production";

const config: webpack.Configuration = {
    mode: isProduction ? "production" : "development",
    entry: path.join(__dirname, "src/main.ts"),
    output: {
        path: path.join(__dirname, "dist"),
        filename: "script.js"
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: {
                    loader: "ts-loader"
                }
            }
        ]
    },
    resolve: {
        extensions: [".ts", ".js"]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.join(__dirname, "src/style.css"),
                    to: path.join(__dirname, "dist/style.css")
                }
            ]
        }),
        new HtmlWebpackPlugin({
            template: path.join(__dirname, "src/index.html"),
            minify: false,
            hash: isProduction
        }),
        new HtmlWebpackTagsPlugin({
            tags: [ "style.css" ],
            hash: isProduction
        })
    ],
    devServer: {
        static: {
            directory: path.join(__dirname, "dist")
        },
        port: 8000
    }
};

export default config;
