# iaslate

iaslate is a portable AI workspace for branching chats, local snapshots, and bring-your-own-model sessions. It runs entirely in the browser and builds into a single static HTML file, so it stays easy to move, host, archive, or use for one-off sessions.

Instead of treating a chat as one flat transcript, iaslate keeps the shape of the conversation visible. You can edit earlier turns, split a reply into a new branch, inspect the tree, and export the full session when an experiment is worth keeping.

## Highlights

- Branch-first conversations: edit, delete, split, duplicate, and revisit alternate paths.
- Tree view: switch from the linear chat to a visual map of the current conversation.
- Local snapshots: import and export JSON files that preserve every branch, not just the active path.
- Provider choice: connect any OpenAI-compatible endpoint, sync its model list, or use Chrome/Edge built-in AI when available.
- Text continuation mode: use OpenAI-compatible providers for direct text completion outside the chat flow.
- Generation controls: tune temperature, max tokens, and token logprobs where the selected provider supports them.

## Provider Support

iaslate is a bring-your-own-provider app. API keys and provider settings are entered by the user in the browser.

- **OpenAI-compatible APIs** support chat and text completion. Enter the API base URL, add an API key if required, and sync models from the provider.
- **Built-in AI in Chrome/Edge** supports chat only. No API key is required, but availability depends on the browser and local model state.

## Privacy Model

iaslate does not provide a backend. API keys are stored locally in the browser with IndexedDB, and requests are sent directly from the client to the selected provider.

Treat keys in iaslate as keys exposed to a local browser app. Do not use credentials you would not trust in client-side JavaScript.

## Usage

1. Open Settings.
2. Add an OpenAI-compatible provider or select Built-in AI.
3. Choose a model when the provider exposes one.
4. Start chatting, then use the branch, import, export, and generation-control buttons in the header as needed.

Keyboard and editor basics:

- Press Enter to send, or Shift+Enter for a newline.
- Hover over a message to reveal copy, edit, delete, and branch actions.
- Drop plaintext files into the composer to append their contents to the prompt.
- Exported snapshots use the current tree format. Older graph exports are not supported.

## Development

Use Bun for local development.

```sh
bun install
bun dev
bunx tsc --noEmit
bun build-dist
```

The production build is configured through Rsbuild with inlined scripts and styles.

## Similar Projects

- [lmg-anon/mikupad](https://github.com/lmg-anon/mikupad): LLM Frontend in a single html file

## License

MIT
