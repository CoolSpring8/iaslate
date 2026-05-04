# Repository Guidelines

## Project Shape

- TypeScript + React 18 app using Mantine, Tailwind, Rsbuild, Zustand, and Bun.
- Root providers live in `src/index.tsx`.
- Settings/provider state lives in `src/state/useSettingsStore.ts`.
- Conversation tree state lives in `src/tree/useConversationTree.ts` and `src/tree/types.ts`.
- AI provider helpers live in `src/ai/`.

## Commands

- Use Bun.
- Install: `bun install`
- Dev server: assume `bun dev` is already running unless asked to start it.
- Format: `bunx biome check --write .`
- Type-check: `bunx tsc --noEmit`
- Build: `bun build-dist`

## UI Verification

- For UI changes, use browser-use with the in-app browser at `http://localhost:8080/`.
- Prefer browser verification over shell curls for localhost UI checks.

## App Constraints

- OpenAI-compatible providers support chat and text completion.
- Built-in AI supports chat only; text completion is disabled.
- Tailwind preflight is not enabled. When using `border`, include `border-solid` and an explicit color.
- API keys are user-provided and stored client-side; never commit secrets or bundle keys into `dist`.
