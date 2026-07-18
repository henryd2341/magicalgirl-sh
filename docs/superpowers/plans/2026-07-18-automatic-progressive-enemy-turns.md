# Automatic Progressive Enemy Turns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically hand control to enemies when the player exhausts Press Turn, then resolve and display exactly one enemy action at a time under symmetric Press Turn rules.

**Architecture:** Replace the monolithic enemy-round resolver with pure turn-initialization, one-action, and round-finalization helpers. Persist progress in the existing `pressTurn`, `pressTurnAllocation`, and `currentActorId` fields; isolate the 600ms scheduling and cancellation lifecycle in a Vue composable.

**Tech Stack:** TypeScript 5.9, Vue 3, Pinia 2, Vitest 3, Testing Library Vue.

---

## File map

- Modify `src/engine/battle/pressTurn.ts`: apply the approved two-icon status-no-effect penalty.
- Modify `src/engine/battle/battleResolver.ts`: initialize enemy turns, resolve one action, and finalize once.
- Modify `src/stores/battleStore.ts`: expose one synchronous enemy step.
- Create `src/ui/battle/useProgressiveEnemyTurn.ts`: own cancellable UI timing.
- Modify `src/ui/battle/BattleOverlay.vue`: install scheduling and remove the manual button.
- Update battle, Boss, Store, composable, overlay, and integration tests listed below.

---

### Task 1: Make the shared Press Turn rules symmetric

**Files:**
- Modify: `tests/unit/battle/press-turn.spec.ts`
- Modify: `src/engine/battle/pressTurn.ts`

- [ ] **Step 1: Write the failing status-no-effect test**

```ts
it("consumes two icons when a status has no effect", () => {
  const before = {
    ownerSide: "enemy" as const,
    icons: [
      { id: "e1", state: "solid" as const },
      { id: "e2", state: "solid" as const },
      { id: "e3", state: "solid" as const },
    ],
  };
  const result = settlePressTurnResultByOutcome(before, "status_no_effect");
  expect(result.kind).toBe("consume_two");
  expect(result.after.icons).toEqual([{ id: "e1", state: "solid" }]);
});
```

- [ ] **Step 2: Verify RED**

Run `pnpm test tests/unit/battle/press-turn.spec.ts -- --reporter=dot`.
Expected: current `no_change` behavior fails the new assertion.

- [ ] **Step 3: Implement the minimal rule change**

Route `status_no_effect` through `consumeTwoIcons` in `settlePressTurnByOutcome`, then return:

```ts
return createSettlementResult(
  "consume_two",
  "status_no_effect",
  state,
  after,
);
```

- [ ] **Step 4: Verify GREEN and commit**

Run the focused test, then commit only the two files with message `统一状态无效的Press Turn消耗`.

---

### Task 2: Automatically initialize the enemy side

**Files:**
- Modify: `tests/unit/battle/battle-resolver.spec.ts`
- Modify: `src/engine/battle/battleResolver.ts`

- [ ] **Step 1: Add failing transition tests**

After the final player icon is consumed, assert:

```ts
expect(resolved).toMatchObject({
  phase: "ENEMY_TURN",
  currentActorId: "enemy-1",
  pressTurn: { ownerSide: "enemy" },
  pressTurnAllocation: {
    participantIds: ["enemy-1", "enemy-2"],
    initialIconCount: 2,
  },
  selectedActionId: null,
  selectedContentId: null,
});
```

Add a second case where living enemies all have `canAct: false`: phase becomes `ENEMY_TURN`, enemy icons are empty, and combat stays active rather than reporting victory.

- [ ] **Step 2: Verify RED**

Run `pnpm test tests/unit/battle/battle-resolver.spec.ts -- --reporter=dot`.
Expected: the current resolver leaves an exhausted player-owned Press Turn.

- [ ] **Step 3: Add a shared side-initialization helper**

```ts
function initializeTurnForSide(
  snapshot: BattleSnapshot,
  participants: BattleParticipant[],
  side: CombatantSide,
): BattleSnapshot {
  const participantIds = getActingParticipantIdsForSide(participants, side);
  return {
    ...snapshot,
    participants,
    pressTurn: createPressTurnStateForSide(participants, side),
    pressTurnAllocation: {
      participantIds,
      initialIconCount: participantIds.length,
    },
    currentActorId: participantIds[0] ?? null,
  };
}
```

Use it when the player becomes exhausted. Clear action, content, target-hint, menu, and swap-selection state. Emit Boss `round_started` once after the player action event.

- [ ] **Step 4: Normalize legacy ENEMY_TURN snapshots**

Add `ensureEnemyTurnInitialized(snapshot)`. Rebuild enemy ownership, allocation, icons, and cursor only when a restored ENEMY_TURN snapshot still contains player-owned or missing enemy turn state. Preserve already-progressed enemy icons.

- [ ] **Step 5: Verify GREEN and commit**

Run the resolver suite and commit the two files with message `自动建立敌方Press Turn`.

---

### Task 3: Resolve exactly one enemy action

**Files:**
- Modify: `tests/unit/battle/battle-resolver.spec.ts`
- Modify: `tests/unit/battle/boss/boss-resolver-integration.spec.ts`
- Modify: `src/engine/battle/battleResolver.ts`

- [ ] **Step 1: Add failing one-step rotation tests**

Use two enemies and three icons:

```ts
const first = resolveNextEnemyAction(snapshot);
expect(enemyActionLogs(first)).toHaveLength(1);
expect(first.phase).toBe("ENEMY_TURN");
expect(first.currentActorId).toBe("enemy-2");
expect(first.pressTurn.icons).toHaveLength(2);

const second = resolveNextEnemyAction(first);
expect(enemyActionLogs(second)).toHaveLength(2);
expect(second.currentActorId).toBe("enemy-1");
expect(second.pressTurn.icons).toHaveLength(1);
```

Add a case proving rotation skips a down or disabled enemy.

- [ ] **Step 2: Add failing outcome settlement tests**

With deterministic affinities/RNG, cover normal hit, heal, support, weak, critical, miss, block, status-no-effect, reflect, and absorb. Assert only one settlement occurs per call and reflected lethal damage removes the caster from later rotation.

- [ ] **Step 3: Add failing grouped-skill tests**

For one all-target skill and one multi-hit skill, assert one action log and one icon settlement, while the log contains every target and the outcomes contain every hit.

- [ ] **Step 4: Verify RED**

Run:

`pnpm test tests/unit/battle/battle-resolver.spec.ts tests/unit/battle/boss/boss-resolver-integration.spec.ts -- --reporter=dot`

- [ ] **Step 5: Extract round finalization**

Create:

```ts
function finishEnemyTurn(snapshot: BattleSnapshot): BattleSnapshot
```

Move status ticks, passive regeneration, Boss `round_ended`, defeat checks, turn-count increment, player Press Turn initialization, and the player-round log into it. It runs only when enemy icons are exhausted or no valid actor remains.

- [ ] **Step 6: Implement the one-action export**

```ts
export function resolveNextEnemyAction(
  snapshot: BattleSnapshot,
): BattleSnapshot
```

Required order:

1. normalize legacy state and current actor;
2. select a fresh Boss or utility action from the current snapshot;
3. gather all targets/hits into one outcome group;
4. apply outcomes, Boss events, and one action log;
5. settle icons with `aggregatePressTurnOutcome` and `settlePressTurnResultByOutcome`, or `settlePassPressTurn` for Boss pass;
6. return RESULT immediately for force defeat or party defeat;
7. call `finishEnemyTurn` when icons are exhausted;
8. otherwise cycle to the next valid actor.

Delete the fixed `attackCount` loop. Remaining actions must derive solely from the updated icon state.

- [ ] **Step 7: Migrate Boss integration assertions**

Replace full-round calls with one call per expected action. Preserve coverage for commandment defeat, DPS attribution, group healing, support, cleanse, counters, and phase transitions.

- [ ] **Step 8: Verify GREEN and commit**

Run both suites and commit with message `拆分渐进式敌方行动结算`.

---

### Task 4: Expose a Store single-step boundary

**Files:**
- Modify: `tests/unit/battle/battle-store.spec.ts`
- Modify: `src/stores/battleStore.ts`

- [ ] **Step 1: Write failing Store tests**

Assert one call appends one enemy action and keeps ENEMY_TURN when icons remain. Retain a one-icon case proving the same call finalizes into PLAYER_COMMAND and rebuilds the player menu.

- [ ] **Step 2: Verify RED**

Run `pnpm test tests/unit/battle/battle-store.spec.ts -- --reporter=dot`.

- [ ] **Step 3: Replace the Store action**

```ts
resolveNextEnemyAction() {
  if (this.activeBattle === null) return;
  this.activeBattle = resolveNextEnemyAction(this.activeBattle);
  if (
    this.activeBattle.phase === "PLAYER_COMMAND" &&
    this.activeBattle.currentActorId != null
  ) {
    this.rebuildActionMenuForActor(this.activeBattle.currentActorId);
  }
}
```

Do not put timers or promises in Pinia. Remove the old full-round Store method and update direct call sites.

- [ ] **Step 4: Verify GREEN and commit**

Run the Store suite and commit with message `提供敌方单步行动接口`.

---

### Task 5: Add a cancellable Vue scheduler

**Files:**
- Create: `src/ui/battle/useProgressiveEnemyTurn.ts`
- Create: `tests/unit/app/progressive-enemy-turn.spec.ts`

- [ ] **Step 1: Write fake-timer tests for the composable API**

```ts
const battle = shallowRef<BattleSnapshot | null>(enemyTurnSnapshot());
const advance = vi.fn(() => {
  battle.value = nextSnapshot(battle.value!);
});

scope.run(() => {
  useProgressiveEnemyTurn({ battle, advance, delayMs: 600 });
});

await vi.advanceTimersByTimeAsync(599);
expect(advance).not.toHaveBeenCalled();
await vi.advanceTimersByTimeAsync(1);
expect(advance).toHaveBeenCalledTimes(1);
```

Add tests for a single running pump, automatic resume from an existing ENEMY_TURN snapshot, cancellation on PLAYER_COMMAND/RESULT/null, and cancellation on `effectScope.stop()`.

- [ ] **Step 2: Verify RED**

Run `pnpm test tests/unit/app/progressive-enemy-turn.spec.ts -- --reporter=dot`.

- [ ] **Step 3: Implement the composable**

```ts
export function useProgressiveEnemyTurn(options: {
  battle: Readonly<Ref<BattleSnapshot | null>>;
  advance: () => void;
  delayMs?: number;
}): { cancel: () => void }
```

Use one `running` flag and a monotonically increasing generation token. Each iteration awaits `nextTick()`, waits 600ms by default, rechecks the generation and current phase, then calls `advance()`. Cancel on scope disposal. Persist no scheduler fields.

- [ ] **Step 4: Verify GREEN and commit**

Run the composable suite and commit with message `添加敌方回合自动调度器`.

---

### Task 6: Wire scheduling into BattleOverlay

**Files:**
- Modify: `tests/unit/app/main-game-battle-overlay.spec.ts`
- Modify: `src/ui/battle/BattleOverlay.vue`

- [ ] **Step 1: Write failing UI tests**

Assert the “结算敌方回合” button is absent. With fake timers and two enemy icons, assert one enemy log appears after 600ms while ENEMY_TURN remains, then a second log appears after another 600ms and control returns to the player. Clear the battle and prove later timers do not mutate it.

- [ ] **Step 2: Verify RED**

Run `pnpm test tests/unit/app/main-game-battle-overlay.spec.ts -- --reporter=dot`.

- [ ] **Step 3: Install the scheduler and remove manual UI**

```ts
useProgressiveEnemyTurn({
  battle: activeBattle,
  advance: () => battleStore.resolveNextEnemyAction(),
});
```

Delete the local full-round handler and the button block. Keep command selection locked during ENEMY_TURN and preserve training-exit handling.

- [ ] **Step 4: Verify GREEN and commit**

Run the overlay suite and commit with message `自动播放渐进式敌方回合`.

---

### Task 7: Integration and regression verification

**Files:**
- Modify only when an assertion explicitly uses the removed full-round API:
  - `tests/integration/battle/combat-flow.spec.ts`
  - remaining `tests/unit/battle/*.spec.ts`

- [ ] **Step 1: Run the focused regression set**

```powershell
pnpm test tests/unit/battle/press-turn.spec.ts tests/unit/battle/battle-resolver.spec.ts tests/unit/battle/battle-store.spec.ts tests/unit/battle/boss/boss-resolver-integration.spec.ts tests/unit/app/progressive-enemy-turn.spec.ts tests/unit/app/main-game-battle-overlay.spec.ts -- --reporter=dot
```

- [ ] **Step 2: Run combat-flow integration**

Run `pnpm test tests/integration/battle/combat-flow.spec.ts -- --reporter=dot`. Replace only explicit manual full-round calls with repeated single steps until the phase changes; preserve session FSM assertions.

- [ ] **Step 3: Run type and production checks**

```powershell
pnpm exec vue-tsc --noEmit
pnpm build
```

Record a repeated Windows esbuild virtual-memory termination separately if type checking has already passed.

- [ ] **Step 4: Run project-wide checks**

```powershell
pnpm test -- --reporter=dot
pnpm lint
```

Separate changed-path failures from the already observed Markdown link assertion, combat-flow setup assertion, ESLint flat-config error, and host memory exhaustion.

- [ ] **Step 5: Inspect the final worktree**

Run `git diff --check` and `git status --short`. Confirm generated directories and unrelated user changes remain unstaged.

- [ ] **Step 6: Commit any necessary integration-test migration**

Commit only the explicitly migrated test files with message `更新渐进式战斗流程测试`.
