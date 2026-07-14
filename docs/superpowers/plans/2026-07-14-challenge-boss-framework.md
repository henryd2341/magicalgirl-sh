# Challenge Boss Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a serializable, event-driven Boss AI framework that coexists with the current utility AI and supports phases, forced actions, counters, DPS checks and encounter-specific mechanics.

**Architecture:** Challenge enemies opt in through `bossProfileId`. Pure-data runtime state lives in `BattleSnapshot`; code-only profiles and mechanic reducers live in a registry. The battle resolver emits domain events, asks the orchestrator for a single intent, and continues to use existing skill/status/Press Turn settlement.

**Tech Stack:** TypeScript, Vue-independent battle engine, Zod content validation, Vitest, seeded RNG.

---

## File map

- Modify `src/types/content.ts` and `src/content/contentRegistry.ts`: optional `bossProfileId` and reserved-ID validation.
- Modify `src/types/battle.ts`: enemy content identity, boss runtime state, event and intent contracts.
- Modify `src/engine/battle/battleSetup.ts`: carry `enemyId` and initialize encounter Boss runtime.
- Create `src/engine/battle/boss/bossTypes.ts`: profile, context, event, intent and state contracts.
- Create `src/engine/battle/boss/bossRegistry.ts`: profile registration and lookup.
- Create `src/engine/battle/boss/bossRuntime.ts`: event reducer, phase transition guard, cooldown and forced-action queue.
- Create `src/engine/battle/boss/bossUtility.ts`: configurable action/target scoring with injected RNG.
- Create `src/engine/battle/boss/bossOrchestrator.ts`: strict priority selection and loop guard.
- Modify `src/engine/battle/battleResolver.ts`: emit events and resolve Boss intents through existing action pipeline.
- Modify `src/engine/battle/battleLogger.ts`: mechanism log helper consumed by Boss events.
- Add unit and integration tests under `tests/unit/battle/boss/` and `tests/integration/battle/`.

### Task 1: Add Boss identity and reserved content rules

**Files:**
- Modify: `src/types/content.ts`
- Modify: `src/content/contentRegistry.ts`
- Modify: `src/engine/training/trainingRules.ts`
- Create: `tests/unit/content/content-registry.spec.ts`
- Test: `tests/unit/training/training-rules.spec.ts`

- [ ] **Step 1: Add failing tests**

Test that enemy records accept `bossProfileId`, free training excludes numeric enemy IDs `>= 100`, duplicate numeric IDs fail loading, and player skill references reject skill IDs `>= 255`.

```ts
expect(isChallengeEnemyId("100")).toBe(true);
expect(isChallengeEnemyId("099")).toBe(false);
expect(isEnemyExclusiveSkillId("255")).toBe(true);
expect(getEligibleFreeTrainingEnemies(99).every((enemy) => Number(enemy.id) < 100)).toBe(true);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test tests/unit/content/content-registry.spec.ts tests/unit/training/training-rules.spec.ts -- --reporter=dot`
Expected: FAIL on missing helpers/schema field.

- [ ] **Step 3: Implement exact helpers and schema field**

```ts
export function isChallengeEnemyId(id: string): boolean {
  return /^\d+$/.test(id) && Number(id) >= 100;
}

export function isEnemyExclusiveSkillId(id: string): boolean {
  return /^\d+$/.test(id) && Number(id) >= 255;
}
```

Add `bossProfileId: z.string().min(1).optional()` to `enemyContentSchema` and `bossProfileId?: string` to raw/resolved enemy types. Add a loader-time duplicate ID check before constructing each Map. Filter `isChallengeEnemyId()` from free-training candidates.

- [ ] **Step 4: Run tests**

Run the same command; expected PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/types/content.ts src/content/contentRegistry.ts src/engine/training/trainingRules.ts tests/unit/content/content-registry.spec.ts tests/unit/training/training-rules.spec.ts
git commit -m "定义挑战敌人与专属技能边界"
```

### Task 2: Define serializable Boss runtime contracts

**Files:**
- Create: `src/engine/battle/boss/bossTypes.ts`
- Modify: `src/types/battle.ts`
- Test: `tests/unit/battle/boss/boss-types.spec.ts`

- [ ] **Step 1: Write failing contract tests**

Instantiate a state, JSON round-trip it, and assert no functions/Sets survive in the data shape.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/battle/boss/boss-types.spec.ts -- --reporter=dot`
Expected: FAIL because module is missing.

- [ ] **Step 3: Add exact contracts**

```ts
export type BossBattleEvent =
  | { type: "battle_started" }
  | { type: "round_started"; turnCount: number }
  | { type: "action_resolved"; actorId: string; actionId: string; targetIds: string[] }
  | { type: "damage_applied"; sourceId: string; targetId: string; amount: number; element: number }
  | { type: "status_applied"; sourceId: string; targetId: string; effectId: string }
  | { type: "participant_down"; participantId: string }
  | { type: "before_enemy_action"; actorId: string }
  | { type: "round_ended"; turnCount: number };

export type BossActionIntent =
  | { type: "use_skill"; actorId: string; skillId: string; targetIds: string[]; reason: string }
  | { type: "pass"; actorId: string; reason: string }
  | { type: "force_defeat"; skillId: string; reason: string };

export interface BossBattleRuntimeState {
  profileIds: Record<string, string>;
  phaseByActorId: Record<string, string>;
  cooldowns: Record<string, number>;
  queuedCounters: Record<string, string | null>;
  flags: Record<string, boolean>;
  counters: Record<string, number>;
  lists: Record<string, string[]>;
  mechanicState: Record<string, unknown>;
  decisionSteps: number;
}
```

Add `enemyId?: string` to `BattleParticipant` and `bossRuntime?: BossBattleRuntimeState` to `BattleSnapshot`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test tests/unit/battle/boss/boss-types.spec.ts -- --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/engine/battle/boss/bossTypes.ts src/types/battle.ts tests/unit/battle/boss/boss-types.spec.ts
git commit -m "定义Boss运行状态与事件契约"
```

### Task 3: Build profile registry and seeded utility selection

**Files:**
- Create: `src/engine/battle/boss/bossRegistry.ts`
- Create: `src/engine/battle/boss/bossUtility.ts`
- Test: `tests/unit/battle/boss/boss-registry.spec.ts`
- Test: `tests/unit/battle/boss/boss-utility.spec.ts`

- [ ] **Step 1: Write failing tests**

Cover duplicate registration rejection, missing profile rejection, deterministic tie-breaking, cooldown exclusion and target scoring.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/battle/boss/boss-registry.spec.ts tests/unit/battle/boss/boss-utility.spec.ts -- --reporter=dot`
Expected: FAIL because modules are missing.

- [ ] **Step 3: Implement the registry contract**

```ts
export interface BossProfile {
  id: string;
  actorEnemyIds: string[];
  initialPhase: string;
  skillIds: string[];
  reduceEvent(context: BossContext, event: BossBattleEvent): BossEffect[];
  selectForcedIntent(context: BossContext): BossActionIntent | null;
  enumerateUtilityCandidates(context: BossContext): BossUtilityCandidate[];
}
```

Export `registerBossProfile`, `getBossProfile`, `hasBossProfile`, and `clearBossProfilesForTests`. Throw on duplicate IDs and missing lookup.

- [ ] **Step 4: Implement injected RNG utility selection**

```ts
export function selectBossUtilityCandidate(
  candidates: BossUtilityCandidate[],
  random: () => number,
): BossUtilityCandidate | null {
  const eligible = candidates.filter((candidate) => candidate.available);
  if (eligible.length === 0) return null;
  return eligible
    .map((candidate) => ({ ...candidate, finalScore: candidate.score + random() * candidate.noise }))
    .sort((a, b) => b.finalScore - a.finalScore || a.stableOrder - b.stableOrder)[0] ?? null;
}
```

- [ ] **Step 5: Run tests and commit**

Run the same test command; expected PASS.

```powershell
git add src/engine/battle/boss/bossRegistry.ts src/engine/battle/boss/bossUtility.ts tests/unit/battle/boss
git commit -m "建立Boss配置注册与效用选择"
```

### Task 4: Implement event reduction and orchestrator priority

**Files:**
- Create: `src/engine/battle/boss/bossRuntime.ts`
- Create: `src/engine/battle/boss/bossOrchestrator.ts`
- Test: `tests/unit/battle/boss/boss-runtime.spec.ts`
- Test: `tests/unit/battle/boss/boss-orchestrator.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert priority: expired hard defeat > revival > one phase transition > queued counter > nonfatal DPS action > emergency > profile tree > utility. Assert `MAX_BOSS_DECISION_STEPS = 32` stops loops and one action causes at most one phase transition.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/battle/boss/boss-runtime.spec.ts tests/unit/battle/boss/boss-orchestrator.spec.ts -- --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Implement pure state reduction**

```ts
export function applyBossBattleEvent(
  snapshot: BattleSnapshot,
  event: BossBattleEvent,
): BattleSnapshot {
  if (!snapshot.bossRuntime) return snapshot;
  return profilesForSnapshot(snapshot).reduce(
    (next, profile) => applyBossEffects(next, profile.reduceEvent(createContext(next), event)),
    snapshot,
  );
}
```

Effects must be a closed union: set phase, set/increment counter, set flag, enqueue counter, set cooldown, append mechanism log. Reject a second phase transition in the same event.

- [ ] **Step 4: Implement intent selection**

Export `selectBossActionIntent(snapshot, actorId, random)`. Reset `decisionSteps` for each actor action, enforce the priority order, then select utility candidate. Return `null` for non-profile enemies so the existing `selectEnemyAction` path remains unchanged.

- [ ] **Step 5: Run tests and commit**

Run the same test command; expected PASS.

```powershell
git add src/engine/battle/boss/bossRuntime.ts src/engine/battle/boss/bossOrchestrator.ts tests/unit/battle/boss
git commit -m "实现Boss事件归约与行动优先级"
```

### Task 5: Initialize and resolve Boss encounters

**Files:**
- Modify: `src/engine/battle/battleSetup.ts`
- Modify: `src/engine/battle/battleResolver.ts`
- Modify: `src/engine/battle/battleLogger.ts`
- Test: `tests/unit/battle/boss/boss-resolver-integration.spec.ts`
- Test: `tests/integration/battle/combat-flow.spec.ts`

- [ ] **Step 1: Write failing integration tests**

Create one registered test profile and assert setup copies `enemyId`, initializes `bossRuntime`, forced intent uses the existing skill resolver, mechanism logs are appended, and a normal enemy still uses legacy utility AI.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/battle/boss/boss-resolver-integration.spec.ts tests/integration/battle/combat-flow.spec.ts -- --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Initialize runtime in setup**

When creating enemy participants, set `enemyId: enemy.enemyId`. After participants are built, gather resolved enemies with `bossProfileId`; validate profiles and build initial runtime. No participating profile means `bossRuntime` stays undefined.

- [ ] **Step 4: Route enemy actions**

Before each enemy action, emit `before_enemy_action`. If `selectBossActionIntent()` returns `use_skill`, resolve that skill with the existing target/status/damage/Press Turn pipeline; if it returns `force_defeat`, append the named mechanism log and create defeat immediately. After each action, emit action, damage, status and down events in that order.

- [ ] **Step 5: Run focused regression tests**

Run: `pnpm test tests/unit/battle/boss tests/unit/battle/battle-resolver.spec.ts tests/integration/battle/combat-flow.spec.ts tests/integration/battle/training-combat-flow.spec.ts -- --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/battle/battleSetup.ts src/engine/battle/battleResolver.ts src/engine/battle/battleLogger.ts tests/unit/battle/boss tests/integration/battle
git commit -m "接入Boss战斗运行框架"
```

### Task 6: Snapshot compatibility and failure isolation

**Files:**
- Modify: `src/engine/runtimePersistenceService.ts`
- Modify: `src/engine/training/trainingSessionService.ts`
- Test: `tests/unit/engine/runtime-persistence-service.spec.ts`
- Test: `tests/integration/persistence/runtime-snapshot-db.spec.ts`
- Test: `tests/integration/battle/training-combat-flow.spec.ts`

- [ ] **Step 1: Add failing tests**

Round-trip an active Boss snapshot, load a legacy snapshot without runtime, and inject corrupt runtime into a training battle. Assert corruption exits training and restores the formal pre-training snapshot.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/engine/runtime-persistence-service.spec.ts tests/integration/persistence/runtime-snapshot-db.spec.ts tests/integration/battle/training-combat-flow.spec.ts -- --reporter=dot`
Expected: FAIL on Boss runtime restoration/validation.

- [ ] **Step 3: Add runtime validation**

Validate only pure JSON values, registered profile IDs, known participant IDs and bounded decision steps. Legacy `bossRuntime: undefined` remains valid. Invalid training runtime calls the existing training discard/restore path and never writes temporary HP/MP/item state to the formal snapshot.

- [ ] **Step 4: Run tests and commit**

Run the same command; expected PASS.

```powershell
git add src/engine/runtimePersistenceService.ts src/engine/training/trainingSessionService.ts tests/unit/engine/runtime-persistence-service.spec.ts tests/integration/persistence/runtime-snapshot-db.spec.ts tests/integration/battle/training-combat-flow.spec.ts
git commit -m "持久化并隔离Boss运行状态"
```

### Task 7: Framework verification checkpoint

- [ ] **Step 1: Run all Boss and battle suites**

Run: `pnpm test tests/unit/battle/boss tests/unit/battle tests/integration/battle tests/integration/persistence/runtime-snapshot-db.spec.ts -- --reporter=dot`
Expected: all selected tests pass.

- [ ] **Step 2: Run static verification**

Run: `pnpm lint`
Expected: no new lint errors in changed files.

Run: `pnpm build`
Expected: typecheck and production build pass.

- [ ] **Step 3: Confirm local content edit isolation**

Run: `git diff -- src/content/skills.jsonl`
Expected: the pre-existing IDs `19–27` Gun-element edits remain unchanged and are not part of framework commits.

