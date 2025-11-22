# iaslate

A tiny browser‑based chat UI packaged as a single static HTML file. It is intended for lightweight, one-off usage.

## Development

- Install dependencies: `bun install`
- Dev: `bun dev`
- Build: `bun build-dist`

## Configure API

1. Click the Settings icon in the header.
2. Choose a provider:
	- **OpenAI‑Compatible**: enter a base URL (e.g. `https://api.openai.com/v1`) and API key, then click "Save". Click "Sync from API" to fetch models.
	- **Built-in AI (Chrome/Edge)**: no API key required. The app will check availability and, if needed, download the built-in model with progress feedback.

## Usage Tips

- Enter a prompt and press Enter to send (Shift+Enter for newline).
- Hover over a message to reveal actions: copy, edit, delete (removes the node and reconnects its children to the parent), or split (detach from its parent to start a new thread).
- Drop plaintext files into the message area to append their contents to the input.
- Import or export the full conversation tree via the header buttons; exported JSON captures every branch, not just the active chat path.
- Snapshots now use the tree format introduced in this refactor; older graph exports are not supported.

## Security Notes

- The API key is stored locally in the browser (IndexedDB) and requests are sent directly from the client. Treat the key as accessible to any JavaScript code running in the page.

## Tech Stack

- React 18, Mantine UI, Tailwind CSS
- Vercel AI SDK
- Rsbuild (Rspack)

## Related Projects

- [lmg-anon/mikupad](https://github.com/lmg-anon/mikupad): LLM Frontend in a single html file

## License

MIT
