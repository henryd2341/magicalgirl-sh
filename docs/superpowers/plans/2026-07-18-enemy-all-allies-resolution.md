# Enemy `all_allies` Resolution Implementation Plan

> **For agentic workers:** Execute inline in the current worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make enemy healing, support, revive, and cleanse skills affect their intended allies instead of being resolved as attacks against players.

**Architecture:** Preserve effect semantics from `ResolvedSkillContent` in `EnemyAction`, then branch enemy execution by skill category. Resolve ally/enemy scopes relative to the acting participant and represent cleansing explicitly in content so both player and enemy paths produce normal battle outcomes and logs.

**Tech Stack:** TypeScript, Vue application battle engine, Zod content validation, Vitest.

---

### Task 1: Lock the regression down

**Files:**
- Modify: `tests/unit/battle/boss/boss-resolver-integration.spec.ts`

- [ ] Add forced-Boss-action tests proving skill 321 heals both living enemies without damaging players, skill 320 buffs both enemies, and skill 322 removes debuffs and ailments.
- [ ] Run `pnpm test tests/unit/battle/boss/boss-resolver-integration.spec.ts -- --reporter=dot` and verify the new assertions fail against the legacy offensive branch.

### Task 2: Preserve and execute enemy skill semantics

**Files:**
- Modify: `src/engine/battle/enemyUtility.ts`
- Modify: `src/engine/battle/battleResolver.ts`
- Modify: `src/types/content.ts`
- Modify: `src/content/contentRegistry.ts`

- [ ] Extend enemy actions with category, status effects, revive, and cleanse metadata.
- [ ] Resolve `all_allies`, `single_ally`, and `self` relative to the enemy actor.
- [ ] Build healing/support outcomes instead of attack outcomes for non-offensive skills, including per-target status rolls and removed-status outcomes.
- [ ] Keep offensive skills on the existing affinity/damage/interrupt path.

### Task 3: Declare cleanse behavior in skill data

**Files:**
- Modify: `src/content/skills.jsonl`

- [ ] Add `healPercent: 50` and debuff cleansing to skill 167.
- [ ] Add debuff cleansing to skill 188.
- [ ] Add debuff and ailment cleansing to skill 322.

### Task 4: Verify

- [ ] Run the focused Boss resolver test.
- [ ] Run `pnpm test tests/unit/battle/battle-resolver.spec.ts tests/unit/battle/boss/boss-resolver-integration.spec.ts -- --reporter=dot`.
- [ ] Run `pnpm test -- --reporter=dot`.
- [ ] Run `pnpm build`.
