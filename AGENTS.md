# Repository Guidelines

## Project Structure & Module Organization

This is a Vue 3 + Vite + TypeScript application. Runtime code lives under `src/`: `app/` contains the shell, `pages/` route views, `ui/` reusable interface components, `stores/` Pinia stores, `engine/` domain logic, `orchestrator/` tool execution, `persistence/` IndexedDB/worker code, `router/` routing, `types/` shared TypeScript types, and `styles/` global CSS. Static assets are in `public/` and `src/assets/`; variable schemas live in `src/content/variableDefs/`. Tests mirror behavior under `tests/unit/`, `tests/integration/`, and `tests/e2e/`. Generated output such as `dist/`, `coverage/`, `test-results/`, and `node_modules/` should not be edited.

## Build, Test, and Development Commands

Use `pnpm` with the checked-in lockfile.

- `pnpm install`: install dependencies.
- `pnpm dev`: start the Vite dev server.
- `pnpm build`: run `vue-tsc --noEmit` and produce the production Vite build.
- `pnpm preview`: serve the built app locally.
- `pnpm test`: run the Vitest suite once.
- `pnpm test:watch`: run Vitest in watch mode.
- `pnpm test:e2e`: run Playwright specs from `tests/e2e/`.
- `pnpm lint`: lint `src`, `tests`, and config files.

## Coding Style & Naming Conventions

Use TypeScript, Vue single-file components, ES modules, and the `@/` alias for imports from `src`. Follow the existing two-space indentation, double quotes, semicolons, and trailing commas where the surrounding code uses them. Name Vue components in PascalCase (`BattleOverlay.vue`), stores as `*Store.ts`, tests as `*.spec.ts`, and domain types by feature under `src/types/`. Prefer small, typed services in `engine/` or `persistence/` over embedding domain logic in components.

## Testing Guidelines

Vitest runs in `jsdom` with `tests/setup.ts`; use `@testing-library/vue` for UI behavior and direct unit tests for stores, engine, orchestrator, and persistence boundaries. Put fast tests in `tests/unit/<feature>/`, persistence flows in `tests/integration/`, and browser-level coverage in `tests/e2e/`. Add or update tests with behavior changes, then run the narrow suite plus `pnpm test` before handing off.

## Commit & Pull Request Guidelines

Recent history uses short descriptive summaries, often in Chinese, without a strict conventional-commit prefix. Keep commits focused and imperative, for example `打通页面路由` or `Add battle overlay tests`. Pull requests should describe the behavior change, list test commands run, link relevant issues, and include screenshots or recordings for UI changes. Note that `CONTRIBUTING.md` currently says worldbook entry contributions are not accepted; avoid unrelated edits under `raw_entries/`.

## Agent-Specific Instructions

Do not overwrite unrelated local changes. Before editing, check `git status --short`; this workspace may contain active user work. Prefer targeted patches and leave generated directories untouched.
