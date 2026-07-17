# Combat Correctness and Broadcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make allocated stats and accessories affect every party member consistently, repair guard and agility calculations, strengthen stat scaling, and expose complete battle outcomes and enemy HP.

**Architecture:** Add one battle-stat resolver in the engine setup layer and keep formula decisions data-driven. Resolve guard and hit chance in the central attack outcome path, then use one participant-aware outcome formatter for both player and enemy logs. Keep UI changes limited to enemy HP rendering.

**Tech Stack:** Vue 3, TypeScript, Pinia battle snapshots, Vitest, JSONL content registry.

---

### Task 1: Formula configuration and central attack correctness

**Files:**
- Modify: `src/types/content.ts`
- Modify: `src/content/contentRegistry.ts`
- Modify: `src/content/formulas.jsonl`
- Modify: `src/engine/battle/formulaEngine.ts`
- Modify: `src/engine/battle/battleResolver.ts`
- Test: `tests/unit/battle/formula-engine.spec.ts`
- Test: `tests/unit/battle/battle-resolver.spec.ts`

- [ ] Add failing tests proving the configurable stat exponent separates attack 30 from 99, guard halves damage, guard suppresses weakness tags, and hit chance uses effective agility exactly once.
- [ ] Run the two focused test files and verify failures are caused by the missing formula fields and guard behavior.
- [ ] Add `statRatioExponent` and `damageMultiplier` to formula validation and use them in damage/guard calculations.
- [ ] Pass effective raw agility into `calculateHitChance`; apply guard after damage modifiers and suppress weak affinity while guarded.
- [ ] Run the focused tests until green.

### Task 2: Canonical party stat and accessory resolution

**Files:**
- Modify: `src/types/battle.ts`
- Modify: `src/engine/battle/battleSetup.ts`
- Test: `tests/unit/battle/battle-setup.spec.ts`

- [ ] Add failing setup tests proving protagonist and companion totals derive from growth plus allocated points, equipped modifier accessories apply, and accessory affinity/effect metadata reaches the participant.
- [ ] Run the setup test and verify the protagonist currently uses stale total fields and equipment is omitted.
- [ ] Add a shared party participant builder that resolves effective stats, current HP/MP, equipped item modifiers, affinities, and accessory effects for both protagonist and companions.
- [ ] Apply start-of-battle accessory buffs in participant setup and retain special accessory effect identifiers for battle rules.
- [ ] Run the setup tests until green.

### Task 3: Symmetric participant-aware outcome logs

**Files:**
- Modify: `src/engine/battle/battleLogger.ts`
- Modify: `src/engine/battle/battleResolver.ts`
- Test: `tests/unit/battle/battle-logger.spec.ts`

- [ ] Add failing logger tests for player damage with remaining HP, Miss, nullify, reflect, absorb, critical, weakness, healing, and status changes using display names.
- [ ] Run the logger test and verify player outcomes are currently discarded.
- [ ] Implement one outcome formatter shared by player and enemy action logs, accepting participants after outcomes have been applied.
- [ ] Update resolver call sites so compact summaries contain decisive results and detailed rows contain per-target HP and effect information.
- [ ] Run logger and resolver tests until green.

### Task 4: Exact enemy HP in BattleOverlay

**Files:**
- Modify: `src/ui/battle/BattleOverlay.vue`
- Test: `tests/unit/app/main-game-battle-overlay.spec.ts`

- [ ] Add a failing component assertion for `HP current/max` on active enemy cards.
- [ ] Run the component test and verify the numeric HP text is absent.
- [ ] Render an enemy HP number beside the existing progress bar without changing pending-battle cards.
- [ ] Run the component test until green.

### Task 5: Regression verification

**Files:**
- Verify all modified source and test files.

- [ ] Run `pnpm test tests/unit/battle/ -- --reporter=dot`.
- [ ] Run `pnpm test tests/unit/app/main-game-battle-overlay.spec.ts -- --reporter=dot`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test -- --reporter=dot`.
- [ ] Run `pnpm build` and inspect `git diff --check` plus `git status --short`.
