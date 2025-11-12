const typography = require("@tailwindcss/typography");
const {
	iconsPlugin,
	getIconCollections,
} = require("@egoist/tailwindcss-icons");
const {
	scopedPreflightStyles,
	isolateInsideOfContainer,
} = require("tailwindcss-scoped-preflight");

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {},
	},
	darkMode: "class",
	plugins: [
		typography(),
		iconsPlugin({
			collections: getIconCollections(["lucide"]),
		}),
		scopedPreflightStyles({
			isolationStrategy: isolateInsideOfContainer(".twp"),
		}),
	],
};
