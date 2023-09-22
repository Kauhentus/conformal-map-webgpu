const path = require('path');

module.exports = {
	entry: './src/index.ts',
	devtool: 'inline-source-map',
	mode: 'development',
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: [
					{
						loader: 'ts-loader',
						options: {
							configFile: "tsconfig.json"
						}
					}
				],
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		extensions: ['.tsx', '.ts', '.js', '.wgsl'],
	},
	output: {
		filename: 'bundle.js',
		path: path.resolve(__dirname, 'conformal'),
	},
	watch: true
};