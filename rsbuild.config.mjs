import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
// import { GenerateSW } from "@aaroon/workbox-rspack-plugin";

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
	tools: {
		rspack: {
			plugins: [
				// new GenerateSW({})
			],
		},
	},
	output: {
		inlineScripts: true,
		inlineStyles: true,
	},
	html: {
		inject: "body",
	},
});
