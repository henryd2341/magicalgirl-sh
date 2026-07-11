# Training Ground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sandboxed training ground with free enemy composition, a data-driven five-stage challenge ladder, guarded hidden-boss puzzle unlocking, and explicit non-narrative combat FSM exits.

**Architecture:** Add battle-source metadata to the existing pending/active battle snapshots and keep the existing Press Turn resolver unchanged. A focused training domain service validates catalogs, builds sandbox encounters, and commits only challenge progress/rewards; the session FSM gains guarded training-complete and training-abort transitions that bypass `POST_COMBAT_READY`. Vue components live under `src/ui/training/`, coordinated by a small Pinia store and mounted by `MainGameView.vue`.

**Tech Stack:** Vue 3 Composition API, Pinia 2, TypeScript 5.9 strict mode, Vitest 3, Testing Library Vue, existing repository/variable engine persistence, existing Press Turn battle engine.

---

## Scope and content gate

This plan implements the full mechanism without inventing the deferred 5+1 content. Production challenge entries remain disabled until a later approved content pass supplies enemy IDs, rewards, puzzle asset, prompt, answer digest, and hidden boss definition. Tests use a complete injected six-entry fixture so sequential unlocking, reward idempotency, and the puzzle flow are executable now. The UI must render “挑战内容尚未开放” when no enabled production catalog is available; there is no default answer or accidental unlock path.

## File map

**Create:**

- `src/types/training.ts` — battle sources, catalog, progress, reward, result, and puzzle types.
- `src/content/trainingCatalog.ts` — production catalog plus catalog validation; initially disabled by the explicit content gate.
- `src/engine/training/trainingRules.ts` — pure enemy filtering, selection validation, unlock, and answer-normalization rules.
- `src/engine/training/trainingSessionService.ts` — start/complete/abort orchestration and idempotent challenge reward commit.
- `src/stores/trainingStore.ts` — overlay/configuration state and calls into session actions.
- `src/ui/training/TrainingGroundOverlay.vue` — accessible modal and tabs.
- `src/ui/training/FreeTrainingPanel.vue` — enemy browser and four-slot composition.
- `src/ui/training/ChallengeLadderPanel.vue` — five-stage ladder and hidden clue.
- `src/ui/training/TrainingBattleConfirm.vue` — party/enemy/rules confirmation.
- `src/ui/training/HiddenChallengePuzzle.vue` — DevTools clue and answer form.
- `tests/helpers/trainingFixtures.ts` — complete enabled 5+1 catalog and progress fixtures.
- `tests/unit/training/training-rules.spec.ts`
- `tests/unit/training/training-session-service.spec.ts`
- `tests/unit/training/training-store.spec.ts`
- `tests/unit/app/training-ground-overlay.spec.ts`
- `tests/integration/battle/training-combat-flow.spec.ts`
- `tests/e2e/training-ground.spec.ts`

**Modify:**

- `src/types/battle.ts` — attach a `BattleSource` to pending and active snapshots.
- `src/types/variables.ts` — add optional backward-compatible training progress.
- `src/types/commands.ts` — add guarded training completion/abort commands.
- `src/content/contentRegistry.ts` — expose a read-only enemy collection.
- `src/engine/variablePolicy.ts` — default and validate training progress.
- `src/engine/battle/battleSetup.ts` — preserve battle source when creating snapshots.
- `src/engine/sessionManager.ts` — explicit training completion/abort transitions.
- `src/engine/gameEngineFacade.ts` — expose the new FSM commands.
- `src/engine/runtimePersistenceService.ts` — never persist active training battles.
- `src/stores/battleStore.ts` — clear active training state through one action.
- `src/stores/sessionStore.ts` — training entry guard, sandbox item handling, completion, abort, and recovery.
- `src/ui/game/GameTopBar.vue` — emit the desktop/mobile training event and expose disabled state.
- `src/ui/battle/BattleOverlay.vue` — training result and exit actions.
- `src/ui/game/BgmPlayer.vue` — select `training` or `tower` music from battle source and restore scene BGM.
- `src/pages/MainGameView.vue` — mount the overlay and connect entry/result flow.
- Existing FSM, battle store, recovery, runtime snapshot, top-bar, and main-game tests.

### Task 1: Define battle-source and training domain contracts

**Files:**
- Create: `src/types/training.ts`
- Modify: `src/types/battle.ts`
- Modify: `src/content/contentRegistry.ts`
- Create: `tests/unit/training/training-rules.spec.ts`

- [ ] **Step 1: Write failing contract tests**

Test that `getAllEnemies()` returns the registry map without mutation helpers, that a pending snapshot requires one of `story | training/free | training/challenge`, and that a challenge fixture can express five normal stages plus one hidden stage.

```ts
expect(getAllEnemies().get("57")?.name).toBe("影兽");
expect(CHALLENGE_FIXTURE.filter((entry) => !entry.hidden)).toHaveLength(5);
expect(CHALLENGE_FIXTURE.filter((entry) => entry.hidden)).toHaveLength(1);
```

- [ ] **Step 2: Run the test and verify the missing exports fail**

Run: `pnpm test tests/unit/training/training-rules.spec.ts -- --reporter=dot`

Expected: FAIL because `@/types/training` and `getAllEnemies` do not exist.

- [ ] **Step 3: Add the contracts**

```ts
export const BATTLE_SOURCES = [
  "story",
  "training/free",
  "training/challenge",
] as const;
export type BattleSource = (typeof BATTLE_SOURCES)[number];

export interface TrainingReward {
  money: number;
  items: Record<string, number>;
}

export interface TrainingChallengeDefinition {
  id: string;
  order: number;
  name: string;
  enabled: boolean;
  hidden: boolean;
  prerequisiteId: string | null;
  enemies: Array<{ enemy_id: string; count: number }>;
  firstClearReward: TrainingReward;
}

export interface TrainingPuzzleDefinition {
  enabled: boolean;
  clueText: string;
  imageUrl: string | null;
  answerDigest: string | null;
  normalizationVersion: 1;
}

export interface TrainingProgress {
  clearedChallengeIds: string[];
  claimedRewardIds: string[];
  hiddenChallengeDiscovered: boolean;
}
```

Add `source: BattleSource` to `PendingBattleSnapshot`, `BattleSnapshot`, and `CreatePendingBattleSnapshotInput`. Add `getAllEnemies(): ReadonlyMap<string, ResolvedEnemyContent>` beside `getAllItems()`.

- [ ] **Step 4: Update existing battle fixture builders with `source: "story"` and run tests**

Run: `pnpm test tests/unit/battle/battle-types.spec.ts tests/unit/battle/battle-store.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/training.ts src/types/battle.ts src/content/contentRegistry.ts tests/unit/training/training-rules.spec.ts tests/unit/battle
git commit -m "定义训练战领域契约"
```

### Task 2: Preserve battle source through battle setup

**Files:**
- Modify: `src/engine/battle/battleSetup.ts`
- Modify: `src/stores/battleStore.ts`
- Modify: `tests/unit/battle/battle-types.spec.ts`
- Modify: `tests/unit/battle/battle-store.spec.ts`

- [ ] **Step 1: Write failing propagation tests**

```ts
const pending = createPendingBattleSnapshot({
  encounterId: "training-free-1",
  narrativeReason: "自由练习",
  source: "training/free",
  enemies: [{ enemy_id: "57", count: 1 }],
});
expect(pending.source).toBe("training/free");
expect(createBattleSnapshotFromPendingBattle({ pendingBattle: pending, playerParty }).source)
  .toBe("training/free");
```

- [ ] **Step 2: Run the narrow tests and verify failure**

Run: `pnpm test tests/unit/battle/battle-types.spec.ts tests/unit/battle/battle-store.spec.ts -- --reporter=dot`

Expected: FAIL because setup drops `source`.

- [ ] **Step 3: Copy `input.source` into pending and active snapshots**

Keep enemy expansion and Press Turn allocation unchanged. Add `clearActiveBattle()` to `battleStore` that nulls `activeBattle`, `onItemConsumed`, and `_currentBattleItems`; do not reset the session FSM from this store.

- [ ] **Step 4: Run the narrow tests**

Run: `pnpm test tests/unit/battle/battle-types.spec.ts tests/unit/battle/battle-store.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/battle/battleSetup.ts src/stores/battleStore.ts tests/unit/battle
git commit -m "传递训练战来源"
```

### Task 3: Add guarded non-narrative FSM exits

**Files:**
- Modify: `src/types/commands.ts`
- Modify: `src/engine/sessionManager.ts`
- Modify: `src/engine/gameEngineFacade.ts`
- Modify: `tests/unit/engine/fsm.spec.ts`

- [ ] **Step 1: Write failing FSM tests**

Cover these exact cases:

```ts
manager.enterCombatPending();
manager.enterCombat();
manager.completeTrainingCombat();
expect(manager.getSnapshot().sessionState).toBe("IDLE");
```

Also assert that both new transitions reject `IDLE`, `COMBAT_PENDING`, and `POST_COMBAT_READY`; `abortTrainingCombat()` accepts only `IN_COMBAT`; and the existing `markPostCombatReady()` behavior is unchanged.

- [ ] **Step 2: Run FSM tests and verify missing methods fail**

Run: `pnpm test tests/unit/engine/fsm.spec.ts -- --reporter=dot`

Expected: FAIL because the new methods and commands are absent.

- [ ] **Step 3: Implement explicit transitions**

Add `COMPLETE_TRAINING_COMBAT` and `ABORT_TRAINING_COMBAT` domain commands. Both session-manager methods must check `snapshot.sessionState === "IN_COMBAT"` before assigning the initial `IDLE` snapshot. Battle-source validation remains in the training service/session store because the session manager deliberately knows only session state.

- [ ] **Step 4: Run FSM tests**

Run: `pnpm test tests/unit/engine/fsm.spec.ts -- --reporter=dot`

Expected: PASS, including all existing main-story transitions.

- [ ] **Step 5: Commit**

```bash
git add src/types/commands.ts src/engine/sessionManager.ts src/engine/gameEngineFacade.ts tests/unit/engine/fsm.spec.ts
git commit -m "增加训练战状态机出口"
```

### Task 4: Implement pure training rules and catalog validation

**Files:**
- Create: `src/content/trainingCatalog.ts`
- Create: `src/engine/training/trainingRules.ts`
- Create: `tests/helpers/trainingFixtures.ts`
- Extend: `tests/unit/training/training-rules.spec.ts`

- [ ] **Step 1: Write failing rule tests**

Test filtering by protagonist level, exclusion of all challenge enemy IDs, zero/5 enemy selection rejection, prerequisite ordering, hidden clue activation after five normal clears, input normalization, and rejection of incomplete puzzle configuration.

```ts
expect(normalizeTrainingAnswer("  MaGiCa  ", 1)).toBe("magica");
expect(canRevealHiddenClue(fixture, {
  clearedChallengeIds: ["trial-1", "trial-2", "trial-3", "trial-4", "trial-5"],
  claimedRewardIds: [],
  hiddenChallengeDiscovered: false,
})).toBe(true);
```

- [ ] **Step 2: Run the rule tests and verify failure**

Run: `pnpm test tests/unit/training/training-rules.spec.ts -- --reporter=dot`

Expected: FAIL with missing rule functions.

- [ ] **Step 3: Implement pure functions**

Export `validateTrainingCatalog`, `listFreeTrainingEnemies`, `validateFreeTrainingSelection`, `isChallengeUnlocked`, `canRevealHiddenClue`, `normalizeTrainingAnswer`, and async `digestTrainingAnswer` using `crypto.subtle.digest("SHA-256", ...)`.

Production `TRAINING_CATALOG` must contain no enabled challenges until content approval. Export an explicitly disabled puzzle:

```ts
export const TRAINING_PUZZLE: TrainingPuzzleDefinition = {
  enabled: false,
  clueText: "谜题尚未开放",
  imageUrl: null,
  answerDigest: null,
  normalizationVersion: 1,
};
```

- [ ] **Step 4: Run the rule tests**

Run: `pnpm test tests/unit/training/training-rules.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/trainingCatalog.ts src/engine/training/trainingRules.ts tests/helpers/trainingFixtures.ts tests/unit/training/training-rules.spec.ts
git commit -m "实现训练场规则与目录校验"
```

### Task 5: Persist backward-compatible training progress

**Files:**
- Modify: `src/types/variables.ts`
- Modify: `src/engine/variablePolicy.ts`
- Create: `tests/unit/training/training-session-service.spec.ts`
- Modify: `tests/unit/variables/variable-policy.spec.ts`

- [ ] **Step 1: Write failing default/legacy tests**

Add `training?: TrainingProgress` to `GameVariablesRoot`. Test that new roots include empty progress and that a legacy `4.0.0` root without `training` still validates and normalizes through `getTrainingProgress(root)`.

```ts
expect(getTrainingProgress(legacyRoot)).toEqual({
  clearedChallengeIds: [],
  claimedRewardIds: [],
  hiddenChallengeDiscovered: false,
});
```

- [ ] **Step 2: Run variable-policy tests and verify failure**

Run: `pnpm test tests/unit/variables/variable-policy.spec.ts -- --reporter=dot`

Expected: FAIL because training progress is undefined.

- [ ] **Step 3: Add defaulting and validation**

Keep schema version `4.0.0` for backward compatibility. Validate unique string IDs and booleans when `training` exists. Export `createDefaultTrainingProgress()` and `getTrainingProgress(root)`; the latter returns a fresh default without mutating legacy roots.

- [ ] **Step 4: Run the tests**

Run: `pnpm test tests/unit/variables/variable-policy.spec.ts tests/unit/training/training-session-service.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/variables.ts src/engine/variablePolicy.ts tests/unit/variables/variable-policy.spec.ts tests/unit/training/training-session-service.spec.ts
git commit -m "持久化训练场进度"
```

### Task 6: Build the training session service

**Files:**
- Create: `src/engine/training/trainingSessionService.ts`
- Extend: `tests/unit/training/training-session-service.spec.ts`

- [ ] **Step 1: Write failing service tests**

Inject catalog lookup, variable reads/writes, and an encounter-staging callback. Test:

- free selection uses `training/free` and rejects challenge-only enemies;
- challenge selection uses `training/challenge` and rejects locked stages;
- victory writes money/items/clear/claim exactly once;
- defeat writes no progress or reward;
- reward save failure leaves progress unclaimed and is retryable;
- puzzle discovery persists only after digest match;
- abort performs no variable write.

- [ ] **Step 2: Run the service tests and verify failure**

Run: `pnpm test tests/unit/training/training-session-service.spec.ts -- --reporter=dot`

Expected: FAIL because `TrainingSessionService` does not exist.

- [ ] **Step 3: Implement the service with one persisted commit**

Define `beginFreeTraining`, `beginChallenge`, `completeTrainingBattle`, `abortTrainingBattle`, and `submitPuzzleAnswer`. `completeTrainingBattle` accepts the resolved `BattleSnapshot`; for challenge victory it constructs one next `GameVariablesRoot` containing both reward and progress, then calls the injected save exactly once. Add the challenge ID to both clear and claimed sets only in that successful save.

- [ ] **Step 4: Run the service tests**

Run: `pnpm test tests/unit/training/training-session-service.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/training/trainingSessionService.ts tests/unit/training/training-session-service.spec.ts
git commit -m "实现训练战会话服务"
```

### Task 7: Integrate sandbox lifecycle into session and runtime persistence

**Files:**
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/engine/runtimePersistenceService.ts`
- Modify: `src/stores/battleStore.ts`
- Modify: `tests/unit/session/session-store.spec.ts`
- Create: `tests/unit/engine/runtime-persistence-service.spec.ts`
- Modify: `tests/unit/engine/combat-refresh-recovery-service.spec.ts`
- Create: `tests/integration/battle/training-combat-flow.spec.ts`

- [ ] **Step 1: Write failing integration tests**

Drive `IDLE → COMBAT_PENDING → IN_COMBAT` with `training/free`, consume an item, resolve victory, and assert formal inventory/HP/MP are unchanged and session returns directly to `IDLE`. Add abort, defeat, challenge reward, refresh, and source-guard cases.

- [ ] **Step 2: Run the integration test and verify current story behavior fails the assertions**

Run: `pnpm test tests/integration/battle/training-combat-flow.spec.ts -- --reporter=dot`

Expected: FAIL because item consumption persists and completion enters `POST_COMBAT_READY`.

- [ ] **Step 3: Add session actions and source guards**

Add `startTrainingBattle`, `completeTrainingBattle`, and `abortTrainingBattle`. For training sources, `startBattle` supplies an item-consumption callback that only updates `battleStore._currentBattleItems`; it never patches `inventory.items`. Completion verifies `activeBattle.source`, calls the service, clears active battle, dispatches `COMPLETE_TRAINING_COMBAT`, and persists the stable idle snapshot. Abort follows the same order without result/reward.

Make `RuntimePersistenceService.saveCurrent` serialize `pendingBattle: null` and `activeBattle: null` whenever either snapshot has a training source. On restore, any legacy snapshot containing a training source is discarded and the session is restored to `IDLE`; story combat recovery remains unchanged.

- [ ] **Step 4: Run session, persistence, recovery, and integration tests**

Run: `pnpm test tests/unit/session/session-store.spec.ts tests/unit/engine/runtime-persistence-service.spec.ts tests/unit/engine/combat-refresh-recovery-service.spec.ts tests/integration/battle/training-combat-flow.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/sessionStore.ts src/stores/battleStore.ts src/engine/runtimePersistenceService.ts tests/unit/session tests/unit/engine tests/integration/battle/training-combat-flow.spec.ts
git commit -m "接入训练战沙盒生命周期"
```

### Task 8: Add the training Pinia store

**Files:**
- Create: `src/stores/trainingStore.ts`
- Create: `tests/unit/training/training-store.spec.ts`

- [ ] **Step 1: Write failing store tests**

Test open/close, tab switching, search, duplicate enemy selection, four-slot cap, selected challenge, confirmation state, preserved configuration after return, and disabled content feedback. Mock only session actions and content access.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test tests/unit/training/training-store.spec.ts -- --reporter=dot`

Expected: FAIL because the store is missing.

- [ ] **Step 3: Implement focused state/actions**

Store refs: `isOpen`, `activeTab`, `searchQuery`, `selectedEnemyIds`, `selectedChallengeId`, `showBattleConfirm`, `lastResult`, `errorMessage`, and `isBusy`. Expose computed eligible enemies, selected enemies, challenges, and `canStart`. Delegate all domain validation and persistence to the rule/service-backed session actions.

- [ ] **Step 4: Run the store tests**

Run: `pnpm test tests/unit/training/training-store.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/trainingStore.ts tests/unit/training/training-store.spec.ts
git commit -m "增加训练场状态管理"
```

### Task 9: Build the accessible training overlay

**Files:**
- Create: `src/ui/training/TrainingGroundOverlay.vue`
- Create: `src/ui/training/FreeTrainingPanel.vue`
- Create: `src/ui/training/ChallengeLadderPanel.vue`
- Create: `src/ui/training/TrainingBattleConfirm.vue`
- Create: `src/ui/training/HiddenChallengePuzzle.vue`
- Create: `tests/unit/app/training-ground-overlay.spec.ts`

- [ ] **Step 1: Write failing UI tests**

Using Testing Library, assert `role="dialog"`, tab semantics, enemy search/add/remove, four-slot feedback, locked challenge buttons, disabled production catalog message, hidden clue/puzzle states with the enabled fixture, trimmed case-insensitive answer submission, Escape close, initial focus, and focus return event.

- [ ] **Step 2: Run and verify missing components fail**

Run: `pnpm test tests/unit/app/training-ground-overlay.spec.ts -- --reporter=dot`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the components**

Use `<script setup lang="ts">`, existing CSS variables, and no hard-coded theme colors. Desktop free practice uses the approved two-column layout; `@media (max-width: 767px)` stacks sections. Put the hidden image URL in an inspectable `data-puzzle-resource` attribute only when the puzzle is enabled and five stages are clear. Do not render an ordinary download link.

- [ ] **Step 4: Run the UI tests**

Run: `pnpm test tests/unit/app/training-ground-overlay.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/training tests/unit/app/training-ground-overlay.spec.ts
git commit -m "构建训练场覆盖层"
```

### Task 10: Wire top bar and main game entry guards

**Files:**
- Modify: `src/ui/game/GameTopBar.vue`
- Modify: `src/pages/MainGameView.vue`
- Modify: `tests/unit/app/app-pages.spec.ts`
- Modify: `tests/unit/app/main-game-battle-overlay.spec.ts`

- [ ] **Step 1: Write failing desktop/mobile entry tests**

Assert both training buttons emit `openTrainingGround`, disabled state exposes an explanation, opening training closes inventory/shop overlays, and the entry is unavailable unless the session is stable `IDLE` with no story turn running.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test tests/unit/app/app-pages.spec.ts tests/unit/app/main-game-battle-overlay.spec.ts -- --reporter=dot`

Expected: FAIL because no training event or overlay mounting exists.

- [ ] **Step 3: Wire the entry**

Add props `trainingDisabled` and `trainingDisabledReason`, emit the event from desktop and mobile buttons, and use native `disabled`, `aria-disabled`, and `title`. `MainGameView` computes the guard, opens the training store, closes competing overlays, mounts `TrainingGroundOverlay`, and restores focus to the triggering button on close.

- [ ] **Step 4: Run the page tests**

Run: `pnpm test tests/unit/app/app-pages.spec.ts tests/unit/app/main-game-battle-overlay.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/game/GameTopBar.vue src/pages/MainGameView.vue tests/unit/app
git commit -m "接入训练场主游戏入口"
```

### Task 11: Add training result/exit UI and music routing

**Files:**
- Modify: `src/ui/battle/BattleOverlay.vue`
- Modify: `src/ui/game/BgmPlayer.vue`
- Modify: `src/composables/useAudio.ts`
- Modify: `tests/unit/app/main-game-battle-overlay.spec.ts`
- Create: `tests/unit/app/bgm-player.spec.ts`

- [ ] **Step 1: Write failing battle UI/music tests**

Assert story results still show the existing complete action, free/challenge results call training completion, unresolved training battles show “退出训练” with confirmation, story battles never show it, free training selects `training`, challenge selects `tower`, and leaving training restores scene BGM.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test tests/unit/app/main-game-battle-overlay.spec.ts tests/unit/app/bgm-player.spec.ts -- --reporter=dot`

Expected: FAIL because the overlay ignores battle source.

- [ ] **Step 3: Route actions by source**

Keep `completeActiveBattle()` exclusively for `source === "story"`. Call `completeTrainingBattle()` only from resolved training results and `abortTrainingBattle()` only after `useGameDialog().confirm(...)`. Map `training/free` to `findBattleTrack(level, "training")` and `training/challenge` to `findBattleTrack(level, "tower")`.

- [ ] **Step 4: Run the battle UI/music tests**

Run: `pnpm test tests/unit/app/main-game-battle-overlay.spec.ts tests/unit/app/bgm-player.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/battle/BattleOverlay.vue src/ui/game/BgmPlayer.vue src/composables/useAudio.ts tests/unit/app
git commit -m "完成训练战退出与音乐分流"
```

### Task 12: Verify persistence/export regression and browser flow

**Files:**
- Modify: `tests/integration/persistence/runtime-snapshot-db.spec.ts`
- Modify: `tests/integration/persistence/full-save-export.spec.ts`
- Modify: `tests/integration/persistence/full-save-import-slots.spec.ts`
- Create: `tests/e2e/training-ground.spec.ts`

- [ ] **Step 1: Add persistence round-trip tests**

Assert `training` progress survives full save export/import, missing legacy progress defaults safely, active training snapshots are not saved, and active story snapshots still round-trip.

- [ ] **Step 2: Run persistence tests**

Run: `pnpm test tests/integration/persistence/runtime-snapshot-db.spec.ts tests/integration/persistence/full-save-export.spec.ts tests/integration/persistence/full-save-import-slots.spec.ts -- --reporter=dot`

Expected: PASS.

- [ ] **Step 3: Add the E2E smoke flow**

The Playwright test opens training from the top bar, confirms the production challenge content-gate message, switches to free practice, selects an eligible enemy, verifies the current vanguard and sandbox warning, then closes and reopens the overlay. It must not add a production-only test injection hook. Challenge completion and reward behavior remain covered by `tests/integration/battle/training-combat-flow.spec.ts` using dependency-injected fixtures until the separate content pass enables the production catalog.

- [ ] **Step 4: Run full verification**

Run, in order:

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e -- tests/e2e/training-ground.spec.ts
```

Expected: all commands exit 0; Vitest reports no failed tests; Vite produces `dist/`; Playwright reports the training smoke spec passed.

- [ ] **Step 5: Commit verification tests**

```bash
git add tests/integration/persistence tests/e2e/training-ground.spec.ts
git commit -m "验证训练场持久化与浏览器流程"
```

## Final implementation review checklist

- [ ] Every pending and active battle has a source; story fixtures explicitly use `story`.
- [ ] Main-story combat still reaches `POST_COMBAT_READY`; no training path can reach it.
- [ ] Training completion and abort reject story sources and invalid FSM states.
- [ ] Training item use, HP, MP, status, and defeat never mutate formal variables.
- [ ] Challenge reward/progress write is one idempotent save and is retryable after failure.
- [ ] Five normal stages and one hidden stage are supported by injected catalogs without hard-coded UI assumptions.
- [ ] Production content remains explicitly disabled until the separate enemy/reward/puzzle design is approved.
- [ ] The hidden image URL appears only after five clears and only as inspectable metadata; no plaintext answer exists.
- [ ] Legacy saves without training progress load successfully.
- [ ] Training runtime snapshots are discarded while story-combat recovery remains unchanged.
- [ ] Desktop/mobile, keyboard, focus, theme, and responsive tests pass.
- [ ] `pnpm lint`, `pnpm test`, `pnpm build`, and the training Playwright smoke test pass.
