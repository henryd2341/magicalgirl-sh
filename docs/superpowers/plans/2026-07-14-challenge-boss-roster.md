# Challenge Boss Roster and Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the five ordered challenge encounters, the hidden dual-magical-girl superboss, exclusive skills, rewards, mechanism broadcasts and seeded balance simulations.

**Architecture:** Each encounter is a focused Boss Profile plus a pure mechanic reducer built on the challenge Boss framework. Static enemy/skill rows live in the existing JSONL registries; encounter order and first-clear rewards live in `trainingCatalog.ts`; simulations tune numeric fields without changing locked mechanics.

**Tech Stack:** TypeScript battle engine, JSONL content, Vitest, Vue/Pinia training store, seeded headless simulations.

---

## Execution precondition and file map

Execute this plan in an isolated worktree created from commit `32e2fb0` or later. The root worktree currently has intentional unstaged `src/content/skills.jsonl` edits changing IDs `19–27` from `Physical` to `Gun`; do not overwrite, stage or silently absorb those edits. Before final integration, preserve them in a separate commit or combine them explicitly with the challenge-skill additions.

Create encounter profiles under `src/engine/battle/boss/profiles/`:

- `moltenCoreSerpentProfile.ts`
- `eternalFrostBeastProfile.ts`
- `corruptedCrownSaintProfile.ts`
- `echoHunterProfile.ts`
- `chaosDollProfile.ts`
- `hiddenMagicalGirlsProfile.ts`
- `registerChallengeBossProfiles.ts`

Also modify `src/content/enemies.jsonl`, `src/content/skills.jsonl`, `src/content/trainingCatalog.ts`, `src/types/training.ts`, Boss runtime/resolver files, and relevant tests.

Initial enemy baselines before simulation:

| ID | Level | HP | ATK | DEF | AGI | INT |
|---|---:|---:|---:|---:|---:|---:|
| 100 | 20 | 700 | 18 | 16 | 20 | 22 |
| 101 | 35 | 1800 | 30 | 34 | 22 | 32 |
| 102 | 35 | 450 | 15 | 20 | 18 | 30 |
| 103 | 35 | 650 | 28 | 30 | 24 | 15 |
| 104 | 50 | 3200 | 35 | 40 | 38 | 52 |
| 105 | 70 | 5000 | 60 | 55 | 72 | 60 |
| 106 | 90 | 8500 | 85 | 82 | 65 | 88 |
| 107 | 99 | 8000 | 110 | 95 | 120 | 105 |
| 108 | 99 | 9000 | 90 | 120 | 80 | 115 |

Initial low/medium/high/finisher skill powers by tier are `80/120/180/240`, `100/160/240/320`, `120/200/300/400`, `150/240/360/480`, `180/300/450/600`, and `200/340/500/700` for levels 20, 35, 50, 70, 90 and 99 respectively. Split multi-hit total power across expected hit count. Default accuracy is 95; deliberate heavy finishers use 90; status chances start at 50 unless the design requires certainty.

### Task 1: Register profiles and enable the six challenge definitions

**Files:**
- Create: `src/engine/battle/boss/profiles/registerChallengeBossProfiles.ts`
- Modify: `src/main.ts`
- Modify: `src/content/trainingCatalog.ts`
- Test: `tests/unit/training/training-rules.spec.ts`

- [ ] **Step 1: Write failing catalog tests**

Assert five visible challenges in order plus one hidden entry, exact prerequisites, exact enemy IDs, and hidden entry gated by discovery.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/training/training-rules.spec.ts -- --reporter=dot`
Expected: FAIL because the catalog is disabled/empty.

- [ ] **Step 3: Add definitions**

Use IDs `challenge-1` through `challenge-5` and `challenge-hidden`; set prerequisites in a strict chain. Enemy arrays are `[100]`, `[101,102,103]`, `[104]`, `[105]`, `[106]`, and `[107,108]`, each count 1. Enable the catalog and register all six profiles during application bootstrap before content validation.

- [ ] **Step 4: Run test and commit**

Run the same command; expected PASS.

```powershell
git add src/main.ts src/content/trainingCatalog.ts src/engine/battle/boss/profiles/registerChallengeBossProfiles.ts tests/unit/training/training-rules.spec.ts
git commit -m "启用挑战模式关卡目录"
```

### Task 2: Implement 熔核幻蛇

**Files:**
- Create: `src/engine/battle/boss/profiles/moltenCoreSerpentProfile.ts`
- Modify: `src/content/enemies.jsonl`
- Modify: `src/content/skills.jsonl`
- Test: `tests/unit/battle/boss/molten-core-serpent.spec.ts`

- [ ] **Step 1: Write failing mechanic tests**

Cover initial molten form, Ice weakness hit -> steam form, steam affinities, Electric weakness hit -> molten form plus one-round defense down, no repeated transition for one action, and telegraphed `263` finisher.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/battle/boss/molten-core-serpent.spec.ts -- --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Add enemy `100` and skills `255–263`**

Use the baseline row above, `bossProfileId: "molten-core-serpent"`, zero rewards, and the exact skill names/effects from design section 4.3. Encode event-only `255/259/262` as self-target support skills with zero power; keep them out of utility candidates. Use `256/257/258/260/263` powers `120/120/80/80/240`; `261` is support.

- [ ] **Step 4: Implement profile reducer and utility candidates**

Store `form` as `"molten" | "steam"`; emit mechanism logs for both transitions; use forced intent `263` one action after its telegraph. Utility chooses fire actions in molten and disruption in steam.

- [ ] **Step 5: Run and commit**

Run the narrow test plus content registry tests; expected PASS.

```powershell
git add src/engine/battle/boss/profiles/moltenCoreSerpentProfile.ts src/content/enemies.jsonl src/content/skills.jsonl tests/unit/battle/boss/molten-core-serpent.spec.ts
git commit -m "实现熔核幻蛇挑战"
```

### Task 3: Implement 永冻巨兽 and its adds

**Files:**
- Create: `src/engine/battle/boss/profiles/eternalFrostBeastProfile.ts`
- Modify: `src/content/enemies.jsonl`
- Modify: `src/content/skills.jsonl`
- Modify: `src/engine/battle/battleSetup.ts`
- Test: `tests/unit/battle/boss/eternal-frost-beast.spec.ts`

- [ ] **Step 1: Write failing tests**

Cover crystal charge/explosion, guard-beast protection, add-dependent boss reduction, 60% phase event, first-kill recording, one-time resummon of the selected add type, and round-8 soft enrage.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/battle/boss/eternal-frost-beast.spec.ts -- --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Add enemy rows `101–103` and skill rows `264–273`**

Use design section 5.1 and baseline stats. Boss affinities: Fire weak, Physical null, Wind reflect, Ice absorb. Crystal and guard use neutral affinities except Ice resist. Powers: `264=160`, `265=160`, `266=100`, `270=320`, `272=160`; other rows are support/passive/event skills.

- [ ] **Step 4: Add summon/protection Boss effects**

Extend the closed `BossEffect` union with `summon_enemy` and `protect_target`. Summons must create normal `BattleParticipant` objects through `createEnemyBattleParticipant`, allocate unique instance IDs, and update Press Turn only at the next enemy round boundary.

- [ ] **Step 5: Implement profile and run tests**

Run the narrow test, `battleSetup` tests and combat integration; expected PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/battle/boss/profiles/eternalFrostBeastProfile.ts src/engine/battle/battleSetup.ts src/content/enemies.jsonl src/content/skills.jsonl tests/unit/battle/boss/eternal-frost-beast.spec.ts
git commit -m "实现永冻巨兽编队挑战"
```

### Task 4: Implement 腐冠圣女

**Files:**
- Create: `src/engine/battle/boss/profiles/corruptedCrownSaintProfile.ts`
- Modify: `src/content/enemies.jsonl`
- Modify: `src/content/skills.jsonl`
- Test: `tests/unit/battle/boss/corrupted-crown-saint.spec.ts`

- [ ] **Step 1: Write failing tests**

Test sow/grow/harvest order, counting existing `ailment` and `dot` statuses without a new status ID, debuff threshold selecting `280`, burn/poison backlash, 65/35% phases and round-10 shortened cycle.

- [ ] **Step 2: Verify failure**

Run the narrow test; expected FAIL.

- [ ] **Step 3: Add content and profile**

Add enemy `104`, skills `274–283`, and profile `corrupted-crown-saint`. Use powers `274=0`, `275=120`, `276=120`, `277=80`, `278=0`, `279=300`, `280=120`, `281=0`, `282=0`, `283=0`. Count status metadata from the existing registry; do not modify `status_effects.jsonl`.

- [ ] **Step 4: Run tests and commit**

Run profile, status-engine and resolver tests; expected PASS.

```powershell
git add src/engine/battle/boss/profiles/corruptedCrownSaintProfile.ts src/content/enemies.jsonl src/content/skills.jsonl tests/unit/battle/boss/corrupted-crown-saint.spec.ts
git commit -m "实现腐冠圣女异常循环"
```

### Task 5: Implement 回声猎手

**Files:**
- Create: `src/engine/battle/boss/profiles/echoHunterProfile.ts`
- Modify: `src/content/enemies.jsonl`
- Modify: `src/content/skills.jsonl`
- Test: `tests/unit/battle/boss/echo-hunter.spec.ts`

- [ ] **Step 1: Write failing tests**

Test completed-round recording only, stable tie-break by first occurrence, phase-dependent dimensions, two-round retention below 40%, public archive logs, and actions `285–292` for repeated patterns.

- [ ] **Step 2: Verify failure**

Run the narrow test; expected FAIL.

- [ ] **Step 3: Add content and profile**

Add enemy `105`, skills `284–293`, and `echo-hunter` profile. Use `285/286/292=360`, `287/288/289/290=150`, support power zero for `284/291/293`. Record `element`, `actionCategory`, and `favoredParticipantId` in serializable mechanic state.

- [ ] **Step 4: Run tests and commit**

Run profile, logger and resolver tests; expected PASS.

```powershell
git add src/engine/battle/boss/profiles/echoHunterProfile.ts src/content/enemies.jsonl src/content/skills.jsonl tests/unit/battle/boss/echo-hunter.spec.ts
git commit -m "实现回声猎手反制机制"
```

### Task 6: Implement 混乱玩偶拼凑体

**Files:**
- Create: `src/engine/battle/boss/profiles/chaosDollProfile.ts`
- Modify: `src/content/enemies.jsonl`
- Modify: `src/content/skills.jsonl`
- Test: `tests/unit/battle/boss/chaos-doll.spec.ts`

- [ ] **Step 1: Write failing tests**

Test visible part integrity, Physical-category damage -> blade, Magic-category damage including Almighty -> eye, successful stat debuff -> core, fixed tie order, all three phase-2 combinations, phase-3 four-round timer and `305` defeat.

- [ ] **Step 2: Verify failure**

Run the narrow test; expected FAIL.

- [ ] **Step 3: Add content and profile**

Add enemy `106`, skills `294–305`, and `chaos-doll` profile. Use powers `295=300`, `296=300`, `297=0`, `300/301/302=450`, `304=300`, `305=0`; other rows are event/support. Store three integrity values on a 0–1000 integer scale to avoid floating-point drift.

- [ ] **Step 4: Run tests and commit**

Run profile, resolver and integration tests; expected PASS.

```powershell
git add src/engine/battle/boss/profiles/chaosDollProfile.ts src/content/enemies.jsonl src/content/skills.jsonl tests/unit/battle/boss/chaos-doll.spec.ts
git commit -m "实现混乱玩偶多阶段挑战"
```

### Task 7: Implement hidden dual-Boss shared mechanics

**Files:**
- Create: `src/engine/battle/boss/profiles/hiddenMagicalGirlsProfile.ts`
- Modify: `src/engine/battle/boss/bossRuntime.ts`
- Test: `tests/unit/battle/boss/hidden-magical-girls.spec.ts`

- [ ] **Step 1: Write boundary-first failing tests**

Cover all ten damage resistances including Almighty, shared 70/35% non-regressing phases, independent 20% crisis flags, recurring 8-round windows, `1999` defeat/`2000` pass, phase-2 `799` fail/`800` pass, damage attribution, simultaneous defeat, next-action 50% revive, delayed revive under action denial, and resistance growth retained through revive.

- [ ] **Step 2: Verify failure**

Run: `pnpm test tests/unit/battle/boss/hidden-magical-girls.spec.ts -- --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Implement shared state**

Use integer counters:

```ts
interface HiddenPairState {
  phase: "trial" | "confluence" | "horizon";
  bigWindowStartRound: number;
  bigWindowDamage: number;
  smallWindow: { remainingPlayerRounds: number; damage: number } | null;
  crisisEntered: Record<"107" | "108", boolean>;
  finalPlayerRoundsRemaining: number | null;
  reviveTargetActorId: string | null;
  ailmentSuccesses: Record<string, Record<string, number>>;
}
```

Effective ailment chance is `max(5, baseChance - 25 * priorSuccesses)`. Only player-attributed direct/DOT actual HP loss increments DPS counters. Big-window failure emits skill `317` and immediate defeat that bypasses all survival effects.

- [ ] **Step 4: Run boundary tests and commit**

Run the narrow test; expected PASS.

```powershell
git add src/engine/battle/boss/profiles/hiddenMagicalGirlsProfile.ts src/engine/battle/boss/bossRuntime.ts tests/unit/battle/boss/hidden-magical-girls.spec.ts
git commit -m "实现隐藏双Boss共享规则"
```

### Task 8: Add hidden Boss skills, roles and public commandments

**Files:**
- Modify: `src/content/enemies.jsonl`
- Modify: `src/content/skills.jsonl`
- Modify: `src/engine/battle/boss/profiles/hiddenMagicalGirlsProfile.ts`
- Test: `tests/unit/battle/boss/hidden-magical-girls-actions.spec.ts`

- [ ] **Step 1: Write failing action tests**

Test commandment thresholds, one queued counter per Boss, revive priority and retained counter, 阳炎 offensive targeting, 大地 healing/cleanse priorities, crisis actions and joint skill availability.

- [ ] **Step 2: Verify failure**

Run the narrow test; expected FAIL.

- [ ] **Step 3: Add enemy rows `107/108` and skills `306–329`**

Use all-damage resistance masks and the design section 9 skill names. Damage powers: `306=170 per expected hit`, `307=340`, `308=500`, `311=700`, `312=500`, `313=500`, `314=340`, `318=500`, `319=340`; support/heal/counter setup rows use zero power where appropriate. `324` restores exactly 50% max HP. `317` is the fixed 9999 defeat presentation.

- [ ] **Step 4: Implement commandments**

Track per player round: skill-ID use counts, guard/pass actor count, each participant's positive stat-stage sum, and actual party healing. Queue `312`, `313`, `325`, or `326` at the exact approved thresholds. Expose each queue through `mechanic` logs and never change conditions by phase.

- [ ] **Step 5: Run tests and commit**

Run hidden profile, logger and combat integration tests; expected PASS.

```powershell
git add src/content/enemies.jsonl src/content/skills.jsonl src/engine/battle/boss/profiles/hiddenMagicalGirlsProfile.ts tests/unit/battle/boss/hidden-magical-girls-actions.spec.ts
git commit -m "完成隐藏魔法少女双Boss"
```

### Task 9: Add first-clear rewards and atomic claiming

**Files:**
- Modify: `src/content/trainingCatalog.ts`
- Modify: `src/engine/training/trainingSessionService.ts`
- Modify: `src/stores/trainingStore.ts`
- Test: `tests/unit/training/training-session-service.spec.ts`
- Test: `tests/integration/persistence/runtime-snapshot-db.spec.ts`

- [ ] **Step 1: Write failing reward tests**

Assert the exact money/items from design section 10, no EXP, one atomic grant, duplicate claim rejection, and formal-save persistence after temporary battle state is discarded.

- [ ] **Step 2: Verify failure**

Run the two test files; expected FAIL.

- [ ] **Step 3: Enter exact rewards**

Use item IDs: `2×2,7×2,28×2,29×2`; `3×2,8×2,11×2,27×3`; `17×3,26×2,52×1,53×1`; `4×2,9×2,22×2,54×1`; `5×2,10×2,13×2,55×1`; `5×3,10×3,13×3,65×1`. Money is `2500/6000/12000/25000/50000/100000`.

- [ ] **Step 4: Run tests and commit**

Run training and persistence tests; expected PASS.

```powershell
git add src/content/trainingCatalog.ts src/engine/training/trainingSessionService.ts src/stores/trainingStore.ts tests/unit/training/training-session-service.spec.ts tests/integration/persistence/runtime-snapshot-db.spec.ts
git commit -m "发放挑战首次通关奖励"
```

### Task 10: Add mechanism broadcasts and Boss UI signals

**Files:**
- Modify: `src/engine/battle/boss/bossRuntime.ts`
- Modify: `src/ui/battle/BattleBroadcastWindow.vue`
- Modify: `src/ui/battle/BattleStatusPanel.vue`
- Test: `tests/unit/app/battle-broadcast-window.spec.ts`
- Test: `tests/unit/app/battle-status-panel.spec.ts`

- [ ] **Step 1: Add failing tests**

Assert compact broadcasts for phase changes, crystal countdown, sow/harvest, echo archive, doll integrity, commandments, DPS progress, revive queue and final countdown. Assert status panel exposes only current actionable signals, while history remains in broadcast.

- [ ] **Step 2: Verify failure**

Run the two UI tests; expected FAIL.

- [ ] **Step 3: Emit public signals**

Every mechanic effect appends `kind: "mechanic", visibility: "both"`. Add an optional `bossSignals` derived view containing active countdowns, queued counter names and current phase; render it in `BattleStatusPanel` without adding a BattleOverlay grid region.

- [ ] **Step 4: Run tests and commit**

Run UI, logger and all Boss profile tests; expected PASS.

```powershell
git add src/engine/battle/boss/bossRuntime.ts src/ui/battle/BattleBroadcastWindow.vue src/ui/battle/BattleStatusPanel.vue tests/unit/app
git commit -m "播报挑战Boss公开机制"
```

### Task 11: Build seeded balance simulations

**Files:**
- Create: `tests/helpers/challengeSimulation.ts`
- Create: `tests/integration/battle/challenge-balance.spec.ts`
- Modify: `src/content/enemies.jsonl`
- Modify: `src/content/skills.jsonl`
- Modify: profile cooldown/weight constants as measured

- [ ] **Step 1: Implement four deterministic player policies**

Create burst, balanced, control and sustain policies. Each returns a legal action from the current snapshot and never reads hidden profile state; it may read public logs/signals.

- [ ] **Step 2: Add simulation assertions**

For a fixed documented seed list, assert each normal challenge has at least two winning policies and no mechanics invariant fails. Record measured win-rate bands for `70/70/50/50/30/5–10%` using the qualified policy/seed matrix.

- [ ] **Step 3: Run simulations and calibrate only allowed values**

Run: `pnpm test tests/integration/battle/challenge-balance.spec.ts -- --reporter=verbose`
Expected: all invariant assertions pass and measured bands match the target. Adjust HP, ordinary skill power, accuracy, status chance, cooldowns and utility weights. Keep locked `2000/8`, `800/2`, 50% revive and final countdowns unchanged.

- [ ] **Step 4: Commit calibrated values**

```powershell
git add tests/helpers/challengeSimulation.ts tests/integration/battle/challenge-balance.spec.ts src/content/enemies.jsonl src/content/skills.jsonl src/engine/battle/boss/profiles
git commit -m "校准挑战Boss战斗数值"
```

### Task 12: Final verification

- [ ] **Step 1: Run challenge-focused suites**

Run: `pnpm test tests/unit/battle/boss tests/unit/training tests/unit/app/battle-broadcast-window.spec.ts tests/unit/app/battle-status-panel.spec.ts tests/integration/battle tests/integration/persistence/runtime-snapshot-db.spec.ts -- --reporter=dot`
Expected: all selected tests pass.

- [ ] **Step 2: Run project checks**

Run: `pnpm lint`
Expected: no new lint errors.

Run: `pnpm test -- --reporter=dot`
Expected: full current suite passes or only already-documented unrelated failures remain, with no challenge/broadcast failures.

Run: `pnpm build`
Expected: typecheck and production build pass.

- [ ] **Step 3: Browser verification**

Run all six encounters: verify visible signals, no formal resource consumption, result handling, one-time rewards, puzzle gating, refresh behavior and floating broadcast interaction.

- [ ] **Step 4: Confirm content IDs and local-edit integration**

Verify enemy IDs `100–108` are unique, skill IDs `255–329` are unique/enemy-only and all use `mpCost: 0`, IDs `19–27` retain the intended `Gun` element after integration, and free training excludes challenge enemies.

