# Repository Guidelines

## Project Structure & Module Organization

- Source lives in `src/` (`index.tsx`, `App.tsx`, `index.css`). Build output goes to `dist/`.
- Providers only in `index.tsx` (e.g., `MantineProvider`). `App.tsx` coordinates views and settings; conversation state and snapshots live in the Zustand store (`src/tree/useConversationTree.ts`, `src/tree/types.ts`), and AI provider helpers live in `src/ai/openaiCompatible.ts`.
- Components under `src/components/` include their own UI behavior (hover/edit states, popovers, menus) rather than being purely presentational.
- Key config: `rsbuild.config.mjs`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `biome.json`.

## Build, Test, and Development Commands

- Install: `bun install` (use Bun for everything; a `bun.lock` is present).
- Dev server: `bun dev` (Rsbuild) — starts hot‑reload and opens the browser.
- Production build: `bun build-dist` — emits static assets to `dist/` (scripts/styles are inlined by Rsbuild config).

## Coding Style & Naming Conventions

- Language: TypeScript + React 18; Mantine for UI; Tailwind for styling.
- Indentation: one tab (Biome default) except for Markdown files where space indentation is used. Keep code concise and self‑documenting.
- Formatting: use Biome. Run `bunx biome check --write .` to format and organize imports.
- Type-checking: use tsc. Run `bunx tsc --noEmit` to check for type errors.
- Components: keep UI logic close to the component (e.g., hover/edit toggles in `MessageItem`, menu interactions in `DiagramView`); shared conversation/tree logic belongs in the store.
- CSS: prefer Tailwind utilities; add global styles in `src/index.css` only when necessary.

## Providers & Capabilities

- OpenAI-compatible: supports chat and text completion views.
- Built-in AI (Chrome/Edge): chat-only; text view is disabled.

## Validation & DevTools MCP

- Assume `bun dev` is already running locally; don’t start it from the agent unless explicitly asked.
- Use Chrome DevTools MCP to navigate to `http://localhost:8080/` to check the UI after changes.
- Avoid shell curls to localhost unless the user explicitly requests; rely on MCP interactions for UI checks.

## Commit & Pull Request Guidelines

- Use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`). Keep diffs focused; avoid drive‑by refactors.
- PRs should include a clear summary, rationale, screenshots/GIFs for UI changes, and testing steps.

## Security & Configuration Tips

- Never commit API keys. Keys are user‑provided and stored client‑side (IndexedDB). Avoid server code or bundling secrets into `dist/`.
