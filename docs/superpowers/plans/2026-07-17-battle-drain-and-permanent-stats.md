# Battle Drain and Permanent Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair HP/MP drain and fixed MP regeneration, then add purchasable permanent stat incense and challenge rewards.

**Architecture:** Skill resource transfer remains in the battle resolver as explicit outcomes so Press Turn, caps, and logs share the normal pipeline. Permanent stat mutation lives in a pure engine service and is persisted atomically by `sessionStore`; battle setup consumes the optional saved bonuses while inventory UI only orchestrates target selection.

**Tech Stack:** Vue 3, Pinia, TypeScript, Zod, Vitest, Testing Library Vue.

---

### Task 1: Content and variable contracts

**Files:**
- Modify: `src/types/content.ts`
- Modify: `src/types/variables.ts`
- Modify: `src/content/contentRegistry.ts`
- Modify: `src/content/variableDefs/gameVariablesRoot.schema.json`
- Modify: `src/content/skills.jsonl`
- Modify: `src/content/items.jsonl`
- Test: `tests/unit/variables/variable-schema-sync.spec.ts`

- [ ] Add failing assertions for skill drain fields, incense stat bonuses, and optional permanent combat bonuses.
- [ ] Run the schema/content tests and verify the new assertions fail.
- [ ] Add `hpDrainPercent`, `mpDrainAmount`, `permanentStatBonus`, and optional `permanentBonuses` contracts with bounded validation.
- [ ] Configure skills 179/180 and items 66-69 at 20,000 gold.
- [ ] Run the schema/content tests and verify they pass.

### Task 2: Drain resolution and broadcast

**Files:**
- Modify: `src/engine/battle/battleResolver.ts`
- Modify: `src/engine/battle/battleLogger.ts`
- Test: `tests/unit/battle/battle-resolver.spec.ts`
- Test: `tests/unit/battle/battle-logger.spec.ts`

- [ ] Add failing tests proving HP drain heals by actual damage, MP drain transfers at most10 without HP damage, caps are respected, and failed attacks do not drain.
- [ ] Run the targeted tests and verify the behavior is absent.
- [ ] Emit separate target loss and actor recovery outcomes from the existing skill pipeline.
- [ ] Extend broadcast formatting for actual HP/MP recovery and MP loss.
- [ ] Run resolver/logger tests and verify they pass.

### Task 3: Fixed MP regeneration

**Files:**
- Modify: `src/engine/battle/passiveEffectEngine.ts`
- Modify: `src/engine/battle/battleResolver.ts`
- Test: `tests/unit/battle/passive-effect-engine.spec.ts`
- Test: `tests/unit/battle/battle-resolver.spec.ts`

- [ ] Add a failing test expecting `mp_regen: 5` to add exactly5 MP while `hp_regen: 5` remains5% HP.
- [ ] Change MP regeneration to a flat value and preserve cap clamping.
- [ ] Add round-boundary log coverage for the actual restored amount.
- [ ] Run the targeted battle tests.

### Task 4: Permanent stat domain and battle setup

**Files:**
- Create: `src/engine/items/permanentStatService.ts`
- Modify: `src/engine/battle/battleSetup.ts`
- Modify: `src/ui/character-build/PointAllocationTab.vue`
- Test: `tests/unit/items/permanent-stat-service.spec.ts`
- Test: `tests/unit/battle/battle-setup.spec.ts`

- [ ] Add failing tests for +1 application, 99 cap, missing combat data, and no mutation on failure.
- [ ] Implement a pure service returning the next combat bonus state and a typed failure reason.
- [ ] Include permanent bonuses before accessory modifiers in player participant creation.
- [ ] Display permanent bonuses separately in point allocation totals.
- [ ] Run item and setup tests.

### Task 5: Atomic incense use and inventory UI

**Files:**
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/ui/game/InventoryOverlay.vue`
- Modify: `src/ui/game/ItemDetailPanel.vue`
- Test: `tests/unit/session/session-store.spec.ts`
- Create: `tests/unit/app/inventory-overlay.spec.ts`

- [ ] Add failing store tests proving a successful use updates bonuses and inventory together while capped use changes neither.
- [ ] Add `usePermanentStatItem(itemId, characterId)` using one variable patch set.
- [ ] Add inventory target buttons for the protagonist and all characters with combat data; disable targets at99.
- [ ] Add UI tests for target selection, success refresh, and cap disabling.
- [ ] Run store and inventory tests.

### Task 6: Challenge rewards and verification

**Files:**
- Modify: `src/content/trainingCatalog.ts`
- Test: `tests/unit/training/training-rules.spec.ts`
- Test: `tests/unit/training/training-session-service.spec.ts`

- [ ] Add failing assertions for the confirmed stage reward quantities.
- [ ] Add items 66-69 to each first-clear reward.
- [ ] Run training tests.
- [ ] Run all changed narrow suites, `pnpm test`, `pnpm build`, and `git diff --check`; report unrelated baseline failures separately.
