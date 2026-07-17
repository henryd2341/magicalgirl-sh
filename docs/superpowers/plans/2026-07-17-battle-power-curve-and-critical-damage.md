# Battle Power Curve and Critical Damage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the power-80 basic attack baseline while making power-300 skills deal about three times its damage and making critical hits deal 1.5 times damage.

**Architecture:** Keep all tuning content-driven through `FormulaParams` and `formulas.jsonl`. Add a pure skill-power base helper to the formula engine, use it from the shared player/enemy damage path, then apply the configured critical multiplier in the resolver after existing damage modifiers.

**Tech Stack:** TypeScript 5.9, Vue 3 project runtime, Zod 4 content validation, Vitest 3.

---

### Task 1: Lock the new power curve with a failing formula test

**Files:**
- Modify: `tests/unit/battle/formula-engine.spec.ts`
- Modify: `src/engine/battle/formulaEngine.ts`

- [ ] **Step 1: Write the failing curve test**

Add a deterministic test comparing `calculateDamage` at powers 80, 100, 150, 200, 300, 500, and 700 with equal attack and defense, zero level influence, and no variance. Assert that power 300 is approximately three times power 80 while power 80 keeps the old `sqrt(160)` baseline.

- [ ] **Step 2: Run the focused formula test and verify RED**

Run: `pnpm test tests/unit/battle/formula-engine.spec.ts -- --reporter=dot`

Expected: FAIL because the existing square-root curve gives power 300 only about 1.94 times power 80.

- [ ] **Step 3: Add the content-driven curve parameters**

Extend `FormulaParams.damage` and the Zod schema with:

```ts
powerReference: number;
powerExponent: number;
```

Register `powerReference: 80` and `powerExponent: 0.83` in `src/content/formulas.jsonl`, and update typed test fixtures.

- [ ] **Step 4: Implement and use the piecewise curve**

Add this pure helper to `formulaEngine.ts` and call it from `calculateDamage`:

```ts
export function calculateSkillPowerBase(
  skillPower: number,
  params: Pick<FormulaParams["damage"], "powerReference" | "powerExponent">,
): number {
  if (skillPower <= params.powerReference) {
    return Math.sqrt(skillPower * 2);
  }
  return Math.sqrt(params.powerReference * 2)
    * Math.pow(skillPower / params.powerReference, params.powerExponent);
}
```

- [ ] **Step 5: Run formula and content tests and verify GREEN**

Run: `pnpm test tests/unit/battle/formula-engine.spec.ts tests/unit/content/content-registry.spec.ts -- --reporter=dot`

Expected: PASS.

### Task 2: Lock the critical damage multiplier with a failing resolver test

**Files:**
- Modify: `tests/unit/battle/battle-resolver.spec.ts`
- Modify: `src/types/content.ts`
- Modify: `src/content/contentRegistry.ts`
- Modify: `src/content/formulas.jsonl`
- Modify: `src/engine/battle/battleResolver.ts`

- [ ] **Step 1: Write the failing critical damage test**

Create identical deterministic attacks with zero and guaranteed critical chance. Assert that the critical outcome keeps the `critical` tag and its absolute `hpDelta` is `Math.floor(normalDamage * 1.5)`.

- [ ] **Step 2: Run the focused resolver test and verify RED**

Run: `pnpm test tests/unit/battle/battle-resolver.spec.ts -- --reporter=dot`

Expected: FAIL because critical hits currently change tags and Press Turn settlement only.

- [ ] **Step 3: Add and validate the multiplier**

Extend `FormulaParams.critRate` and its Zod schema with `damageMultiplier: number`, requiring a positive value. Register `damageMultiplier: 1.5` in `formulas.jsonl` and update typed fixtures.

- [ ] **Step 4: Apply critical damage in the shared resolver path**

Immediately after the crit roll, apply:

```ts
if (isCrit) {
  damage = Math.floor(damage * params.critRate.damageMultiplier);
}
```

Keep the existing `critical` tag so Press Turn behavior remains intact.

- [ ] **Step 5: Run the focused resolver test and verify GREEN**

Run: `pnpm test tests/unit/battle/battle-resolver.spec.ts -- --reporter=dot`

Expected: PASS.

### Task 3: Regression verification

**Files:**
- Verify all modified source, content, and test files.

- [ ] **Step 1: Run all battle and content unit tests**

Run: `pnpm test tests/unit/battle tests/unit/content -- --reporter=dot`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: PASS with no lint errors.

- [ ] **Step 3: Run the complete test suite**

Run: `pnpm test -- --reporter=dot`

Expected: PASS.

- [ ] **Step 4: Run the production build**

Run: `pnpm build`

Expected: TypeScript checking and Vite production build both succeed.
