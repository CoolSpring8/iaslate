# Repository Guidelines

## Project Structure & Module Organization

- Source lives in `src/` (`index.tsx`, `App.tsx`, `index.css`). Build output goes to `dist/`.
- Providers only in `index.tsx` (e.g., `MantineProvider`). `App.tsx` owns application state, while presentational pieces live in `src/components/`.
- Key config: `rsbuild.config.mjs`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `biome.json`.

## Build, Test, and Development Commands

- Install: `bun install` (use Bun for everything; a `bun.lock` is present).
- Dev server: `bun dev` (Rsbuild) — starts hot‑reload and opens the browser.
- Production build: `bun build-dist` — emits static assets to `dist/` (scripts/styles are inlined by Rsbuild config).
- Preview production build: `bun preview` — serves the built output locally.

## Coding Style & Naming Conventions

- Language: TypeScript + React 18; Tailwind for styling.
- Indentation: one tab (Biome default). Keep code concise and self‑documenting.
- Formatting: use Biome. Run `bunx biome check --write .` to format and organize imports.
- Components: prefer small presentational components in `src/components/`; keep core state and data flow inside `App.tsx`.
- CSS: prefer Tailwind utilities; add global styles in `src/index.css` only when necessary.

## Validation & DevTools MCP

- Assume `bun dev` is already running locally; don’t start it from the agent unless explicitly asked.
- Use Chrome DevTools MCP to navigate to `http://localhost:8080/` to check the UI after changes.
- Avoid shell curls to localhost unless the user explicitly requests; rely on MCP interactions for UI checks.

## Commit & Pull Request Guidelines

- Use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`). Keep diffs focused; avoid drive‑by refactors.
- PRs should include a clear summary, rationale, screenshots/GIFs for UI changes, and testing steps.

## Security & Configuration Tips

- Never commit API keys. Keys are user‑provided and stored client‑side (IndexedDB). Avoid server code or bundling secrets into `dist/`.
