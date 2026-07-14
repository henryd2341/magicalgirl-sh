# Floating Battle Broadcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-layout-affecting, translucent, draggable, resizable, minimizable battle broadcast window for every active battle.

**Architecture:** Extend the engine-owned battle log into structured summary/detail entries, then render those entries in a Teleported Vue component. Keep window preferences in a versioned localStorage composable; keep combat logs in the current `BattleSnapshot` only.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, Vitest, Testing Library Vue, Pointer Events, localStorage.

---

## File map

- Modify `src/types/battle.ts`: structured log enums and entry contract.
- Modify `src/engine/battle/battleLogger.ts`: sequence assignment, detail generation, mechanism entries, 1000-entry retention.
- Modify `src/engine/battle/battleResolver.ts`: pass outcome and Press Turn details into logger drafts.
- Create `src/composables/useBattleBroadcastPreferences.ts`: versioned preference parsing, persistence and viewport clamping.
- Create `src/ui/battle/BattleBroadcastWindow.vue`: Teleported floating window and all pointer/keyboard interactions.
- Modify `src/ui/battle/BattleOverlay.vue`: mount the broadcast window for active/result battles.
- Modify `tests/unit/battle/battle-logger.spec.ts`: structured logging coverage.
- Create `tests/unit/app/battle-broadcast-window.spec.ts`: UI and persistence behavior.
- Modify `tests/unit/app/main-game-battle-overlay.spec.ts`: integration and lifecycle coverage.

### Task 1: Define structured battle log contracts

**Files:**
- Modify: `src/types/battle.ts:217-225`
- Test: `tests/unit/battle/battle-types.spec.ts`

- [ ] **Step 1: Write the failing type/runtime contract test**

Add assertions for exported constants:

```ts
import {
  BATTLE_LOG_KINDS,
  BATTLE_LOG_VISIBILITIES,
} from "@/types/battle";

expect(BATTLE_LOG_KINDS).toEqual([
  "action", "damage", "status", "press_turn", "mechanic", "result", "system",
]);
expect(BATTLE_LOG_VISIBILITIES).toEqual(["both", "detail"]);
```

- [ ] **Step 2: Run the narrow test and verify failure**

Run: `pnpm test tests/unit/battle/battle-types.spec.ts -- --reporter=dot`
Expected: FAIL because the two constants are not exported.

- [ ] **Step 3: Add the exact contracts**

```ts
export const BATTLE_LOG_KINDS = [
  "action", "damage", "status", "press_turn", "mechanic", "result", "system",
] as const;
export type BattleLogKind = (typeof BATTLE_LOG_KINDS)[number];

export const BATTLE_LOG_VISIBILITIES = ["both", "detail"] as const;
export type BattleLogVisibility = (typeof BATTLE_LOG_VISIBILITIES)[number];

export interface BattleLogEntry {
  id: string;
  sequence: number;
  turnCount: number;
  side: CombatantSide | "system";
  kind: BattleLogKind;
  visibility: BattleLogVisibility;
  actorId?: string;
  actionId?: string;
  targetIds?: string[];
  summary: string;
  details?: string[];
}

export type BattleLogDraft = Omit<BattleLogEntry, "id" | "sequence"> & {
  id?: string;
};
```

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm test tests/unit/battle/battle-types.spec.ts -- --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/types/battle.ts tests/unit/battle/battle-types.spec.ts
git commit -m "扩展结构化战斗日志契约"
```

### Task 2: Centralize log sequencing, compatibility and retention

**Files:**
- Modify: `src/engine/battle/battleLogger.ts`
- Test: `tests/unit/battle/battle-logger.spec.ts`

- [ ] **Step 1: Add failing tests**

Cover: monotonic `sequence`, unique IDs, legacy entries without structured fields, `createMechanicLogEntry`, and trimming 1001 drafts to 1000 entries.

```ts
const next = appendBattleLogs({ ...snapshot, battleLog: [] }, [
  createMechanicLogDraft(1, "阶段变化", ["进入第二阶段"]),
]);
expect(next[0]).toMatchObject({ sequence: 1, kind: "mechanic", visibility: "both" });
expect(appendBattleLogs({ ...snapshot, battleLog: next }, drafts1000)).toHaveLength(1000);
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/battle/battle-logger.spec.ts -- --reporter=dot`
Expected: FAIL on missing draft API and sequence fields.

- [ ] **Step 3: Implement sequencing and cap**

Use these public helpers:

```ts
export const MAX_BATTLE_LOG_ENTRIES = 1000;

export function createMechanicLogDraft(
  turnCount: number,
  summary: string,
  details: string[] = [],
): BattleLogDraft {
  return {
    turnCount,
    side: "system",
    kind: "mechanic",
    visibility: "both",
    summary,
    details,
  };
}

export function appendBattleLogs(
  snapshot: BattleSnapshot,
  drafts: BattleLogDraft[],
): BattleLogEntry[] {
  const existing = (snapshot.battleLog ?? []).map(normalizeLegacyBattleLogEntry);
  let sequence = existing.at(-1)?.sequence ?? 0;
  const appended = drafts.map((draft) => {
    sequence += 1;
    return {
      ...draft,
      sequence,
      id: draft.id ?? `battle-log-${sequence}`,
    } satisfies BattleLogEntry;
  });
  return [...existing, ...appended].slice(-MAX_BATTLE_LOG_ENTRIES);
}
```

`normalizeLegacyBattleLogEntry()` must map missing `sequence/kind/visibility` to the array index, `"system"`, and `"both"` while preserving `summary`.

- [ ] **Step 4: Convert every logger creator to return `BattleLogDraft`**

Action/result/round-start entries use `visibility: "both"`; per-hit, status and Press Turn-only entries use `visibility: "detail"`. Put each action's per-target lines in `details` rather than top-level entries.

- [ ] **Step 5: Run logger and resolver tests**

Run: `pnpm test tests/unit/battle/battle-logger.spec.ts tests/unit/battle/battle-resolver.spec.ts -- --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/battle/battleLogger.ts src/engine/battle/battleResolver.ts tests/unit/battle/battle-logger.spec.ts tests/unit/battle/battle-resolver.spec.ts
git commit -m "生成结构化战斗播报"
```

### Task 3: Add versioned broadcast preferences

**Files:**
- Create: `src/composables/useBattleBroadcastPreferences.ts`
- Create: `tests/unit/app/battle-broadcast-preferences.spec.ts`

- [ ] **Step 1: Write failing preference tests**

Test default `{ x: 24, y: 24, width: 380, height: 320, minimized: false, density: "compact" }`, corrupt JSON fallback, version mismatch fallback, save/reload, and viewport clamping.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/app/battle-broadcast-preferences.spec.ts -- --reporter=dot`
Expected: FAIL because the composable does not exist.

- [ ] **Step 3: Implement the composable**

```ts
export const BATTLE_BROADCAST_STORAGE_KEY = "magicalgirl:battle-broadcast:v1";
export const DEFAULT_BATTLE_BROADCAST_PREFERENCES = {
  version: 1 as const,
  x: 24,
  y: 24,
  width: 380,
  height: 320,
  minimized: false,
  density: "compact" as const,
};
```

Export `clampBattleBroadcastPreferences(input, viewport)` and `useBattleBroadcastPreferences()`. Clamp width to `280..min(720, viewport.width - 16)`, height to `180..min(0.7 * viewport.height, viewport.height - 16)`, and keep at least 44px of the header/icon visible. Catch all localStorage read/write errors.

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/unit/app/battle-broadcast-preferences.spec.ts -- --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/composables/useBattleBroadcastPreferences.ts tests/unit/app/battle-broadcast-preferences.spec.ts
git commit -m "持久化战斗播报窗口偏好"
```

### Task 4: Build the Teleported floating window

**Files:**
- Create: `src/ui/battle/BattleBroadcastWindow.vue`
- Create: `tests/unit/app/battle-broadcast-window.spec.ts`

- [ ] **Step 1: Write failing component tests**

Mount with three structured entries and assert: Teleport target, compact filtering, detail expansion, no automatic scroll, unread count, jump-to-latest, minimize icon, drag only from header, resize bounds, and keyboard movement.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/app/battle-broadcast-window.spec.ts -- --reporter=dot`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the public component contract**

```ts
const props = defineProps<{
  entries: BattleLogEntry[];
  turnCount: number;
}>();
```

The template root must be:

```vue
<Teleport to="body">
  <button v-if="preferences.minimized" class="battle-broadcast-icon" ... />
  <aside v-else class="battle-broadcast" role="complementary" ...>
    <header tabindex="0" class="battle-broadcast__header">...</header>
    <div ref="logElement" role="log" class="battle-broadcast__log">...</div>
    <footer>...</footer>
    <button class="battle-broadcast__resize" aria-label="调整战斗播报窗口尺寸" />
  </aside>
  <p class="sr-only" aria-live="polite">{{ latestKeyAnnouncement }}</p>
</Teleport>
```

Use Pointer Events with pointer capture. Use `position: fixed`; translucent theme background `color-mix(... / 82%)`, `backdrop-filter: blur(10px)`, solid fallback, independent z-index, and modal-safe layering. Do not call `scrollTo()` from the entry watcher; only increment unread count.

- [ ] **Step 4: Run component tests**

Run: `pnpm test tests/unit/app/battle-broadcast-window.spec.ts -- --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/battle/BattleBroadcastWindow.vue tests/unit/app/battle-broadcast-window.spec.ts
git commit -m "构建悬浮战斗播报窗"
```

### Task 5: Integrate with BattleOverlay lifecycle

**Files:**
- Modify: `src/ui/battle/BattleOverlay.vue`
- Modify: `tests/unit/app/main-game-battle-overlay.spec.ts`

- [ ] **Step 1: Add failing integration tests**

Assert the component is absent during pending battle, present during active and result phases, receives `activeBattle.battleLog`, works for story and training sources, and disappears after active battle cleanup.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/app/main-game-battle-overlay.spec.ts -- --reporter=dot`
Expected: FAIL because no broadcast is mounted.

- [ ] **Step 3: Mount without changing HUD layout**

Import the component and place it as a sibling at the end of the active branch:

```vue
<BattleBroadcastWindow
  v-if="activeBattle"
  :entries="activeBattle.battleLog ?? []"
  :turn-count="activeBattle.turnCount"
/>
```

Do not add a new `battle-hud` grid row or column.

- [ ] **Step 4: Run UI and combat integration tests**

Run: `pnpm test tests/unit/app/main-game-battle-overlay.spec.ts tests/integration/battle/combat-flow.spec.ts tests/integration/battle/training-combat-flow.spec.ts -- --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/battle/BattleOverlay.vue tests/unit/app/main-game-battle-overlay.spec.ts
git commit -m "接入全局战斗播报窗"
```

### Task 6: Verification checkpoint

- [ ] **Step 1: Run focused tests**

Run: `pnpm test tests/unit/battle/battle-logger.spec.ts tests/unit/battle/battle-types.spec.ts tests/unit/app/battle-broadcast-preferences.spec.ts tests/unit/app/battle-broadcast-window.spec.ts tests/unit/app/main-game-battle-overlay.spec.ts tests/integration/battle/combat-flow.spec.ts tests/integration/battle/training-combat-flow.spec.ts -- --reporter=dot`
Expected: all selected files pass.

- [ ] **Step 2: Run static checks and production build**

Run: `pnpm lint`
Expected: no new lint errors in changed files.

Run: `pnpm build`
Expected: `vue-tsc --noEmit` and Vite build succeed.

- [ ] **Step 3: Manual browser check**

Run: `pnpm dev`
Verify story and training battles at desktop and narrow viewport: translucent background, drag, resize, minimize, unread badge, manual scrolling, preference restoration, result retention, and modal layering.

- [ ] **Step 4: Commit any verification-only fixes**

```powershell
git add src/composables/useBattleBroadcastPreferences.ts src/ui/battle/BattleBroadcastWindow.vue src/ui/battle/BattleOverlay.vue tests/unit/app tests/unit/battle
git commit -m "完善战斗播报窗交互"
```
