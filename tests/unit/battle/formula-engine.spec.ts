import { describe, it, expect } from "vitest";
import {
  calculateDamage,
  calculateHitChance,
  calculateCritChance,
  calculateExpToNextLevel,
  calculateExpGained,
  statsAtLevel,
  computeDerivedCombatStats,
  resolveAffinityMultiplier,
  resolveAffinityOutcomeType,
  calculateGuardReduction,
  rollHit,
  rollCrit,
} from "@/engine/battle/formulaEngine";
import { BATTLE_ELEMENTS } from "@/types/battle";
import type { FormulaParams } from "@/types/content";

function makeParams(overrides?: Partial<FormulaParams>): FormulaParams {
  return {
    damage: { varianceMin: 0.95, varianceMax: 1.05, levelInfluence: 0.01, minDamage: 1 },
    affinity: { weak: 1.5, resist: 0.5, nullify: 0, normal: 1.0 },
    hitRate: { agilityInfluence: 0.2, minHitRate: 5, maxHitRate: 95 },
    critRate: { base: 5, agilityBonus: 0.1, max: 50 },
    exp: { baseExpToNext: 50, levelExponent: 1.5 },
    guard: { damageReduction: 1 },
    ...overrides,
  };
}

// ── Damage formula ──

describe("calculateDamage", () => {
  const params = makeParams().damage;

  it("returns at least minDamage", () => {
    const dmg = calculateDamage(1, 1, 99, 1, 1.0, params);
    expect(dmg).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 when affinity multiplier is 0", () => {
    const dmg = calculateDamage(10, 1, 5, 10, 0, params);
    expect(dmg).toBe(0);
  });

  it("scales with attack stat", () => {
    const low = calculateDamage(5, 1, 5, 10, 1.0, { ...params, varianceMin: 1, varianceMax: 1 });
    const high = calculateDamage(20, 1, 5, 10, 1.0, { ...params, varianceMin: 1, varianceMax: 1 });
    expect(high).toBeGreaterThan(low);
  });

  it("decreases with higher defense", () => {
    const lowDef = calculateDamage(10, 1, 5, 10, 1.0, { ...params, varianceMin: 1, varianceMax: 1 });
    const highDef = calculateDamage(10, 1, 20, 10, 1.0, { ...params, varianceMin: 1, varianceMax: 1 });
    expect(highDef).toBeLessThan(lowDef);
  });

  it("handles zero defense gracefully", () => {
    const dmg = calculateDamage(10, 1, 0, 10, 1.0, params);
    expect(dmg).toBeGreaterThanOrEqual(1);
  });

  it("weak affinity increases damage above normal", () => {
    const normal = calculateDamage(10, 1, 5, 10, 1.0, { ...params, varianceMin: 1, varianceMax: 1 });
    const weak = calculateDamage(10, 1, 5, 10, 1.5, { ...params, varianceMin: 1, varianceMax: 1 });
    expect(weak).toBeGreaterThan(normal);
  });

  it("level provides slight bonus", () => {
    const lv1 = calculateDamage(10, 1, 5, 10, 1.0, { ...params, varianceMin: 1, varianceMax: 1 });
    const lv50 = calculateDamage(10, 50, 5, 10, 1.0, { ...params, varianceMin: 1, varianceMax: 1 });
    expect(lv50).toBeGreaterThan(lv1);
  });
});

// ── Hit chance ──

describe("calculateHitChance", () => {
  const params = makeParams().hitRate;

  it("returns skill accuracy when agility equal", () => {
    expect(calculateHitChance(90, 10, 10, params)).toBe(90);
  });

  it("increases with attacker agility advantage", () => {
    const base = calculateHitChance(90, 10, 10, params);
    const higher = calculateHitChance(90, 20, 10, params);
    expect(higher).toBeGreaterThan(base);
  });

  it("decreases with defender agility advantage", () => {
    const base = calculateHitChance(90, 10, 10, params);
    const lower = calculateHitChance(90, 10, 20, params);
    expect(lower).toBeLessThan(base);
  });

  it("clamps to minHitRate", () => {
    const result = calculateHitChance(5, 1, 100, params);
    expect(result).toBeGreaterThanOrEqual(params.minHitRate);
  });

  it("clamps to maxHitRate", () => {
    const result = calculateHitChance(100, 100, 1, params);
    expect(result).toBeLessThanOrEqual(params.maxHitRate);
  });
});

// ── Crit chance ──

describe("calculateCritChance", () => {
  const params = makeParams().critRate;

  it("returns base crit at 0 agility", () => {
    expect(calculateCritChance(0, params)).toBe(5);
  });

  it("increases with agility", () => {
    expect(calculateCritChance(50, params)).toBeGreaterThan(5);
  });

  it("caps at max", () => {
    expect(calculateCritChance(999, params)).toBeLessThanOrEqual(params.max);
  });
});

// ── Roll functions ──

describe("rollHit", () => {
  it("always hits at 100%", () => {
    for (let i = 0; i < 100; i++) {
      expect(rollHit(100)).toBe(true);
    }
  });

  it("always misses at 0%", () => {
    for (let i = 0; i < 100; i++) {
      expect(rollHit(0)).toBe(false);
    }
  });
});

describe("rollCrit", () => {
  it("always crits at 100%", () => {
    for (let i = 0; i < 100; i++) {
      expect(rollCrit(100)).toBe(true);
    }
  });

  it("never crits at 0%", () => {
    for (let i = 0; i < 100; i++) {
      expect(rollCrit(0)).toBe(false);
    }
  });
});

// ── Experience ──

describe("calculateExpToNextLevel", () => {
  const params = makeParams().exp;

  it("level 1 requires base exp", () => {
    const result = calculateExpToNextLevel(1, params);
    expect(result).toBe(50); // 50 * 1^1.5
  });

  it("higher levels require more exp", () => {
    const lv2 = calculateExpToNextLevel(2, params);
    const lv3 = calculateExpToNextLevel(3, params);
    expect(lv3).toBeGreaterThan(lv2);
  });
});

describe("calculateExpGained", () => {
  it("returns at least 1", () => {
    expect(calculateExpGained(1, 1, 99)).toBeGreaterThanOrEqual(1);
  });

  it("higher enemy level gives more exp", () => {
    const low = calculateExpGained(10, 1, 1);
    const high = calculateExpGained(10, 5, 1);
    expect(high).toBeGreaterThan(low);
  });
});

// ── Growth tables ──

describe("statsAtLevel", () => {
  const base = { hp: 60, mp: 30, attack: 5, defense: 5, agility: 5, intelligence: 5 };
  const perLevel = { hp: 15, mp: 6, attack: 2, defense: 2, agility: 2, intelligence: 2 };

  it("level 1 returns base stats", () => {
    const stats = statsAtLevel(base, perLevel, 1);
    expect(stats.hp.current).toBe(60);
    expect(stats.hp.max).toBe(60);
    expect(stats.attack).toBe(5);
  });

  it("level 5 includes perLevel growth", () => {
    const stats = statsAtLevel(base, perLevel, 5);
    // base + perLevel * 4
    expect(stats.hp.current).toBe(60 + 15 * 4);
    expect(stats.attack).toBe(5 + 2 * 4);
    expect(stats.agility).toBe(5 + 2 * 4);
  });

  it("mp tracks current and max equally", () => {
    const stats = statsAtLevel(base, perLevel, 3);
    expect(stats.mp.current).toBe(stats.mp.max);
  });
});

// ── Derived combat stats ──

describe("computeDerivedCombatStats", () => {
  const hitParams = makeParams().hitRate;
  const critParams = makeParams().critRate;

  it("returns accuracy, evasion, critRate", () => {
    const result = computeDerivedCombatStats(10, hitParams, critParams);
    expect(result.accuracy).toBeGreaterThan(0);
    expect(result.evasion).toBeGreaterThan(0);
    expect(result.critRate).toBeGreaterThanOrEqual(0);
  });

  it("accuracy is higher than evasion at the same agility", () => {
    const result = computeDerivedCombatStats(10, hitParams, critParams);
    expect(result.accuracy).toBeGreaterThan(result.evasion);
  });
});

// ── Affinity resolution ──

describe("resolveAffinityMultiplier", () => {
  const params = makeParams().affinity;

  it("returns weak multiplier", () => {
    const result = resolveAffinityMultiplier(
      { weak: BATTLE_ELEMENTS.Fire, resist: 0, nullify: 0, reflect: 0, absorb: 0 },
      BATTLE_ELEMENTS.Fire,
      params,
    );
    expect(result).toBe(1.5);
  });

  it("returns resist multiplier", () => {
    const result = resolveAffinityMultiplier(
      { weak: 0, resist: BATTLE_ELEMENTS.Ice, nullify: 0, reflect: 0, absorb: 0 },
      BATTLE_ELEMENTS.Ice,
      params,
    );
    expect(result).toBe(0.5);
  });

  it("returns nullify multiplier (0)", () => {
    const result = resolveAffinityMultiplier(
      { weak: 0, resist: 0, nullify: BATTLE_ELEMENTS.Dark, reflect: 0, absorb: 0 },
      BATTLE_ELEMENTS.Dark,
      params,
    );
    expect(result).toBe(0);
  });

  it("returns normal multiplier for no match", () => {
    const result = resolveAffinityMultiplier(
      { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 },
      BATTLE_ELEMENTS.Fire,
      params,
    );
    expect(result).toBe(1.0);
  });
});

describe("resolveAffinityOutcomeType", () => {
  it("reflect returns outcomeType reflect", () => {
    const result = resolveAffinityOutcomeType(
      { weak: 0, resist: 0, nullify: 0, reflect: BATTLE_ELEMENTS.Physical, absorb: 0 },
      BATTLE_ELEMENTS.Physical,
    );
    expect(result.outcomeType).toBe("reflect");
    expect(result.preventedBy).toBe("reflect");
  });

  it("absorb returns outcomeType absorb", () => {
    const result = resolveAffinityOutcomeType(
      { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: BATTLE_ELEMENTS.Earth },
      BATTLE_ELEMENTS.Earth,
    );
    expect(result.outcomeType).toBe("absorb");
    expect(result.preventedBy).toBe("absorb");
  });

  it("nullify returns outcomeType block", () => {
    const result = resolveAffinityOutcomeType(
      { weak: 0, resist: 0, nullify: BATTLE_ELEMENTS.Light, reflect: 0, absorb: 0 },
      BATTLE_ELEMENTS.Light,
    );
    expect(result.outcomeType).toBe("block");
    expect(result.preventedBy).toBe("nullify");
  });

  it("normal returns null outcomeType", () => {
    const result = resolveAffinityOutcomeType(
      { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 },
      BATTLE_ELEMENTS.Fire,
    );
    expect(result.outcomeType).toBeNull();
  });
});

// ── Guard ──

describe("calculateGuardReduction", () => {
  const params = makeParams().guard;

  it("reduces damage by guard amount", () => {
    expect(calculateGuardReduction(5, params)).toBe(4);
  });

  it("never goes below 0", () => {
    expect(calculateGuardReduction(0, params)).toBe(0);
  });

  it("handles damage less than reduction", () => {
    expect(calculateGuardReduction(1, { damageReduction: 3 })).toBe(0);
  });
});
