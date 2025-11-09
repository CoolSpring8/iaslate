import { MantineProvider, createTheme } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@mantine/core/styles.css";
import "./index.css";

const theme = createTheme({});

const container = document.getElementById("root");
if (!container) {
	throw new Error("Root element #root not found");
}

const root = ReactDOM.createRoot(container);
root.render(
	<React.StrictMode>
		<MantineProvider theme={theme}>
			<App />
		</MantineProvider>
	</React.StrictMode>,
);
