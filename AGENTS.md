# Repository Guidelines

## Project Structure & Module Organization

- Source lives in `src/` (`index.tsx`, `App.tsx`, `index.css`). Build output goes to `dist/`.
- Providers only in `index.tsx` (e.g., `MantineProvider`). All UI markup, styles, and logic stay in `App.tsx`.
- Only two constructs in `App.tsx`: `App` and a `Component` helper. Imports, types, and constants may live at the top of the file; almost everything else belongs inside `App`.
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
- Components: do not create new React components or files for UI. Use the `Component` helper as an inline pseudo‑component wherever a nested component would normally be used.
- CSS: prefer Tailwind utilities; add global styles in `src/index.css` only when necessary.

## UI Centralization & Component Helper

- Everything UI‑related lives in `App`. The `Component` helper enables nesting JSX and hooks indefinitely without adding new components/files.
- Example (inside `App.tsx`):
  ```tsx
  export function App() {
    const [countA, setCountA] = useState(0);
    return (
      <>
        <h3>Counters</h3>
        <Component>
          {() => {
            const [countB, setCountB] = useState(0);
            return (
              <button
                onClick={() => {
                  setCountA((c) => c + 1);
                  setCountB((c) => c + 2);
                }}
              >
                CountA: {countA}, CountB: {countB}
              </button>
            );
          }}
        </Component>
      </>
    );
  }
  ```
  Use `Component` wherever you would otherwise extract a child component.

## Testing Guidelines

- No test runner is configured. Include clear manual verification steps in PRs; optional minimal tests (`*.test.ts(x)`) can land in a follow‑up.
- Verify `bun build-dist` and core flows in README “Usage Tips”.

## Commit & Pull Request Guidelines

- Use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`). Keep diffs focused; avoid drive‑by refactors.
- PRs should include a clear summary, rationale, screenshots/GIFs for UI changes, and testing steps.

## Security & Configuration Tips

- Never commit API keys. Keys are user‑provided and stored client‑side (IndexedDB). Avoid server code or bundling secrets into `dist/`.
