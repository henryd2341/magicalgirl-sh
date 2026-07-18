# Hidden Challenge Download Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let players discover `/hiddenchallenge` in the HTML, visit it to download `puzzle.png`, return to the original URL, and unlock the persistent hidden challenge with `OUR MEMORIALS`.

**Architecture:** A small browser-entry module handles the special pathname before application bootstrap and remains independent from the memory-history Vue Router. Existing training rules and persistence remain authoritative; only the production puzzle definition and clue text change.

**Tech Stack:** TypeScript 5.9, DOM APIs, Vue 3, Vitest 3, SHA-256 Web Crypto.

---

### Task 1: Special download pathname

**Files:**
- Create: `src/app/hiddenChallengeDownload.ts`
- Create: `tests/unit/app/hidden-challenge-download.spec.ts`
- Modify: `src/main.ts`

- [x] **Step 1: Write failing pathname tests**

Test `handleHiddenChallengeDownload()` against jsdom history. Cover an ordinary path with no side effects, `/hiddenchallenge` downloading `/puzzle.png` and restoring `/`, and `/game/hiddenchallenge?source=devtools#clue` downloading `/game/puzzle.png` while restoring `/game?source=devtools#clue`.

- [x] **Step 2: Verify RED**

Run: `pnpm test tests/unit/app/hidden-challenge-download.spec.ts -- --reporter=dot`

Expected: FAIL because `@/app/hiddenChallengeDownload` does not exist.

- [x] **Step 3: Implement the minimal entry handler**

Create an exported function that returns `false` for paths without the suffix. On a matching path, derive the return pathname, create and click a temporary same-origin anchor with `download="puzzle.png"`, remove it, preserve query/hash in `history.replaceState`, and return `true`.

- [x] **Step 4: Call the handler before bootstrap work**

Import and call `handleHiddenChallengeDownload()` in `src/main.ts` before theme initialization, persistence initialization, Pinia creation, and Vue mounting.

- [x] **Step 5: Verify GREEN**

Run: `pnpm test tests/unit/app/hidden-challenge-download.spec.ts -- --reporter=dot`

Expected: PASS.

### Task 2: Discoverable HTML clue and production puzzle configuration

**Files:**
- Modify: `index.html`
- Modify: `src/content/trainingCatalog.ts`
- Modify: `src/ui/training/HiddenChallengePuzzle.vue`
- Modify: `tests/unit/training/training-rules.spec.ts`
- Modify: `tests/unit/app/training-ground-overlay.spec.ts`

- [x] **Step 1: Write failing production-configuration tests**

Assert that `TRAINING_PUZZLE` is enabled, references `/puzzle.png`, carries digest `60956c648459ec2cfae4cbda4bf29c0fe13c288d5cf1d71739c8ddb0c5bc0c4b`, validates with `TRAINING_CATALOG`, and matches the real digest of `OUR MEMORIALS`. Update the overlay expectation to `/puzzle.png` and check the Elements-panel clue text.

- [x] **Step 2: Verify RED**

Run: `pnpm test tests/unit/training/training-rules.spec.ts tests/unit/app/training-ground-overlay.spec.ts -- --reporter=dot`

Expected: FAIL because the production puzzle is disabled and the UI still uses the generic resource hint.

- [x] **Step 3: Enable the puzzle and add the static clue**

Set the production puzzle fields to the approved image and digest. Add `<!-- /hiddenchallenge -->` to `index.html`. Change the visible hint to direct players to DevTools Elements comments without printing the special pathname.

- [x] **Step 4: Verify GREEN**

Run: `pnpm test tests/unit/training/training-rules.spec.ts tests/unit/app/training-ground-overlay.spec.ts -- --reporter=dot`

Expected: PASS.

### Task 3: Real-answer persistence regression

**Files:**
- Modify: `tests/unit/training/training-session-service.spec.ts`

- [x] **Step 1: Add the real-answer service test**

Construct `TrainingSessionService` with `TRAINING_CATALOG`, `TRAINING_PUZZLE`, five cleared production challenge IDs, and the normal Web Crypto digest path. Submit `  Our Memorials  ` and assert a single save with `hiddenChallengeDiscovered: true`.

- [x] **Step 2: Run the service test**

Run: `pnpm test tests/unit/training/training-session-service.spec.ts -- --reporter=dot`

Expected: PASS after Task 2 supplies the enabled digest configuration.

- [x] **Step 3: Run focused regressions**

Run: `pnpm test tests/unit/app/hidden-challenge-download.spec.ts tests/unit/app/training-ground-overlay.spec.ts tests/unit/training/training-rules.spec.ts tests/unit/training/training-session-service.spec.ts -- --reporter=dot`

Expected: PASS.

- [x] **Step 4: Run production verification**

Run: `pnpm build`

Expected: Type checking and the Vite production build succeed, including copying `public/puzzle.png`.
