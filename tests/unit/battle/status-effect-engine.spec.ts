import {
  applyStatusEffect,
  checkShield,
  computeEffectiveStats,
  consumeChargeChantFocus,
  isDisabledByAilment,
  tickStatusEffects,
} from "@/engine/battle/statusEffectEngine";
import type { ActiveStatusEffect } from "@/types/battle";

// Hardcoded element bitmasks to avoid circular import with contentRegistry
const ELEM = { Physical: 1, Fire: 4, Ice: 8, Electric: 16, Wind: 32, Earth: 64 } as const;
import type { StatusEffectContent } from "@/types/content";
import { describe, expect, it } from "vitest";

// ── Helpers ──

function makeEffectMap(effects: StatusEffectContent[]): Map<string, StatusEffectContent> {
  const map = new Map<string, StatusEffectContent>();
  for (const e of effects) map.set(e.id, e);
  return map;
}

function se(
  id: string,
  type: StatusEffectContent["type"] = "buff",
  duration: number = 3,
  opts: Partial<StatusEffectContent> = {},
): StatusEffectContent {
  return {
    id,
    name: id,
    type,
    duration,
    stackable: opts.stackable ?? false,
    ...opts,
  };
}

// ── Tests ──

describe("statusEffectEngine", () => {
  // ── computeEffectiveStats ──

  describe("computeEffectiveStats", () => {
    it("returns base stats when no effects are active", () => {
      const result = computeEffectiveStats(
        { attack: 10, defense: 8, agility: 12, intelligence: 6 },
        [],
        new Map(),
      );
      expect(result.attack).toBe(10);
      expect(result.defense).toBe(8);
      expect(result.agility).toBe(12);
      expect(result.intelligence).toBe(6);
    });

    it("applies attack_up stack to attack", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "attack_up", remainingDuration: 3, stacks: 1 },
      ];
      const map = makeEffectMap([
        se("attack_up", "buff", 3, { statModifiers: { attack: 1 }, stackable: true }),
      ]);
      const result = computeEffectiveStats({ attack: 10, defense: 5, agility: 5, intelligence: 5 }, effects, map);
      expect(result.attack).toBe(11);
    });

    it("clamps attack_up to +2 max", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "attack_up", remainingDuration: 3, stacks: 3 },
      ];
      const map = makeEffectMap([
        se("attack_up", "buff", 3, { statModifiers: { attack: 1 }, stackable: true }),
      ]);
      const result = computeEffectiveStats({ attack: 10, defense: 5, agility: 5, intelligence: 5 }, effects, map);
      expect(result.attack).toBe(12); // +2 max
    });

    it("applies defense_down to defense", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "defense_down", remainingDuration: 3, stacks: 1 },
      ];
      const map = makeEffectMap([
        se("defense_down", "debuff", 3, { statModifiers: { defense: -1 }, stackable: true }),
      ]);
      const result = computeEffectiveStats({ attack: 5, defense: 8, agility: 5, intelligence: 5 }, effects, map);
      expect(result.defense).toBe(7);
    });

    it("cancels out attack_up + attack_down", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "attack_up", remainingDuration: 3, stacks: 1 },
        { effectId: "attack_down", remainingDuration: 2, stacks: 1 },
      ];
      const map = makeEffectMap([
        se("attack_up", "buff", 3, { statModifiers: { attack: 1 }, stackable: true }),
        se("attack_down", "debuff", 3, { statModifiers: { attack: -1 }, stackable: true }),
      ]);
      const result = computeEffectiveStats({ attack: 10, defense: 5, agility: 5, intelligence: 5 }, effects, map);
      expect(result.attack).toBe(10);
    });
  });

  // ── applyStatusEffect ──

  describe("applyStatusEffect", () => {
    it("adds a new status effect", () => {
      const result = applyStatusEffect(
        [],
        "attack_up",
        3,
        se("attack_up", "buff", 3, { statModifiers: { attack: 1 }, stackable: true }),
      );
      expect(result.applied).toBe(true);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0]).toMatchObject({ effectId: "attack_up", remainingDuration: 3, stacks: 1 });
    });

    it("stacks a stackable effect", () => {
      const existing: ActiveStatusEffect[] = [
        { effectId: "attack_up", remainingDuration: 2, stacks: 1 },
      ];
      const result = applyStatusEffect(
        existing,
        "attack_up",
        3,
        se("attack_up", "buff", 3, { statModifiers: { attack: 1 }, stackable: true }),
      );
      expect(result.effects[0].stacks).toBe(2);
      expect(result.effects[0].remainingDuration).toBe(3); // refreshed
    });

    it("does not add new stacks once max is reached", () => {
      const existing: ActiveStatusEffect[] = [
        { effectId: "attack_up", remainingDuration: 1, stacks: 2 },
      ];
      const result = applyStatusEffect(
        existing,
        "attack_up",
        3,
        se("attack_up", "buff", 3, { statModifiers: { attack: 1 }, stackable: true }),
      );
      expect(result.applied).toBe(false);
      expect(result.effects[0].stacks).toBe(2);
    });

    it("refreshes duration for non-stackable effect", () => {
      const existing: ActiveStatusEffect[] = [
        { effectId: "charge", remainingDuration: 1, stacks: 1 },
      ];
      const result = applyStatusEffect(existing, "charge", 999, se("charge", "buff", 999));
      expect(result.effects[0].remainingDuration).toBe(999);
    });
  });

  // ── tickStatusEffects ──

  describe("tickStatusEffects", () => {
    it("decrements duration and removes expired effects", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "attack_up", remainingDuration: 1, stacks: 1 },
      ];
      const map = makeEffectMap([
        se("attack_up", "buff", 3, { statModifiers: { attack: 1 }, stackable: true }),
      ]);
      const result = tickStatusEffects(effects, { current: 100, max: 100 }, map);
      expect(result.updatedEffects).toHaveLength(0);
      expect(result.expiredEffectIds).toEqual(["attack_up"]);
    });

    it("applies DOT damage on tick", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "poison", remainingDuration: 2, stacks: 1 },
      ];
      const map = makeEffectMap([
        se("poison", "dot", 3, { damagePercent: 10 }),
      ]);
      const result = tickStatusEffects(effects, { current: 100, max: 100 }, map);
      expect(result.hpDelta).toBe(-10); // 10% of 100
      expect(result.updatedEffects).toHaveLength(1); // still 1 turn remaining
    });

    it("does not tick perpetual effects (duration >= 999)", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "charge", remainingDuration: 999, stacks: 1 },
      ];
      const map = makeEffectMap([
        se("charge", "buff", 999),
      ]);
      const result = tickStatusEffects(effects, { current: 100, max: 100 }, map);
      expect(result.updatedEffects).toHaveLength(1);
      expect(result.updatedEffects[0].remainingDuration).toBe(999);
    });

    it("kills target when instant_death expires", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "instant_death", remainingDuration: 1, stacks: 1 },
      ];
      const map = makeEffectMap([
        se("instant_death", "ailment", 1),
      ]);
      const result = tickStatusEffects(effects, { current: 50, max: 100 }, map);
      expect(result.hpDelta).toBe(-50); // full HP
    });
  });

  // ── checkShield ──

  describe("checkShield", () => {
    it("returns blocked for matching element nullify shield", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "fire_null", remainingDuration: 1, stacks: 1 },
      ];
      const result = checkShield(effects, ELEM.Fire);
      expect(result.blocked).toBe(true);
      expect(result.kind).toBe("nullify");
      expect(result.shieldEffectId).toBe("fire_null");
    });

    it("returns blocked for matching element reflect shield", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "ice_reflect", remainingDuration: 1, stacks: 1 },
      ];
      const result = checkShield(effects, ELEM.Ice);
      expect(result.blocked).toBe(true);
      expect(result.kind).toBe("reflect");
    });

    it("returns blocked for physical nullify shield", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "physical_null", remainingDuration: 1, stacks: 1 },
      ];
      const result = checkShield(effects, ELEM.Physical);
      expect(result.blocked).toBe(true);
      expect(result.kind).toBe("nullify");
    });

    it("returns not blocked when no matching shield", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "fire_null", remainingDuration: 1, stacks: 1 },
      ];
      const result = checkShield(effects, ELEM.Ice);
      expect(result.blocked).toBe(false);
    });

    it("returns not blocked for empty effects", () => {
      const result = checkShield([], ELEM.Fire);
      expect(result.blocked).toBe(false);
    });
  });

  // ── consumeChargeChantFocus ──

  describe("consumeChargeChantFocus", () => {
    it("doubles damage when charge is consumed by physical skill", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "charge", remainingDuration: 999, stacks: 1 },
      ];
      const result = consumeChargeChantFocus(effects, "physical");
      expect(result.damageMultiplier).toBe(2);
      expect(result.effects).toHaveLength(0); // consumed
    });

    it("does not consume charge for magic skill", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "charge", remainingDuration: 999, stacks: 1 },
      ];
      const result = consumeChargeChantFocus(effects, "magic");
      expect(result.damageMultiplier).toBe(1);
      expect(result.effects).toHaveLength(1); // not consumed
    });

    it("guarantees crit when focus is consumed", () => {
      const effects: ActiveStatusEffect[] = [
        { effectId: "focus", remainingDuration: 999, stacks: 1 },
      ];
      const result = consumeChargeChantFocus(effects, "physical");
      expect(result.guaranteedCrit).toBe(true);
    });
  });

  // ── isDisabledByAilment ──

  describe("isDisabledByAilment", () => {
    it("returns true for sleep", () => {
      expect(isDisabledByAilment([{ effectId: "sleep", remainingDuration: 2, stacks: 1 }])).toBe(true);
    });

    it("returns true for freeze", () => {
      expect(isDisabledByAilment([{ effectId: "freeze", remainingDuration: 1, stacks: 1 }])).toBe(true);
    });

    it("returns false for non-disabling effects", () => {
      expect(isDisabledByAilment([{ effectId: "attack_up", remainingDuration: 3, stacks: 1 }])).toBe(false);
    });

    it("returns false when no effects", () => {
      expect(isDisabledByAilment([])).toBe(false);
    });
  });
});
