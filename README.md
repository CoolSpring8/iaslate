# iaslate

A tiny browser‑based chat UI packaged as a single static HTML file. It is intended for lightweight, one-off usage.

## Development

- Install dependencies: `bun install`
- Dev: `bun dev`
- Build: `bun build-dist`

## Configure API

1. Click the Settings icon in the header.
2. Enter your OpenAI‑compatible base URL (e.g. `https://api.openai.com/v1`) and API key, then click "Save".
3. Click "Sync from API" to fetch model list.

## Usage Tips

- Enter a prompt and press Enter to send (Shift+Enter for newline).
- Hover over a message to reveal actions: copy, edit, delete, unlink (remove this message and all messages after).
- Drop plaintext files into the message area to append their contents to the input.
- Import or export the full conversation graph via the header buttons; exported JSON captures every node/edge, not just the active chat path.

## Security Notes

- The API key is stored locally in the browser (IndexedDB) and requests are sent from the client (`dangerouslyAllowBrowser: true`). Treat the key as accessible to any JavaScript code running in the page.

## Tech Stack

- React 18, Mantine UI, Tailwind CSS
- Rsbuild (Rspack)

## Related Projects

- [lmg-anon/mikupad](https://github.com/lmg-anon/mikupad): LLM Frontend in a single html file

## License

MIT
