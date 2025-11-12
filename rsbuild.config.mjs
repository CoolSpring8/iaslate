import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

export default defineConfig({
	plugins: [pluginReact()],
	module: {
		rules: [
			{
				test: /\.css$/,
				use: ["postcss-loader"],
				type: "css",
			},
		],
	},
	output: {
		inlineScripts: true,
		inlineStyles: true,
	},
	html: {
		inject: "body",
	},
});
