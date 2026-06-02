import {
  applyPassiveAffinities,
  applyPassivesAtHook,
  collectPassives,
  elementBitToName,
} from "@/engine/battle/passiveEffectEngine";
import type { PassiveEffectDef } from "@/types/content";
import type { BattleAffinityProfile } from "@/types/battle";
import { BATTLE_ELEMENTS } from "@/types/battle";
import { describe, expect, it } from "vitest";

// ── Helpers ──

function pe(
  hook: PassiveEffectDef["hook"],
  type: PassiveEffectDef["type"],
  overrides: Partial<PassiveEffectDef> = {},
): PassiveEffectDef {
  return { hook, type, value: 0, ...overrides };
}

function defaultAffinities(): BattleAffinityProfile {
  return { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 };
}

// ── collectPassives ──

describe("collectPassives", () => {
  it("returns empty array for undefined input", () => {
    expect(collectPassives(undefined)).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(collectPassives([])).toEqual([]);
  });

  it("returns the same array for non-empty input", () => {
    const passives = [pe("on_damage_calc", "element_boost", { value: 25, element: "Fire" })];
    expect(collectPassives(passives)).toEqual(passives);
  });
});

// ── applyPassiveAffinities ──

describe("applyPassiveAffinities", () => {
  it("returns base affinities unchanged when passives are empty", () => {
    const base = { weak: BATTLE_ELEMENTS.Fire, resist: 0, nullify: 0, reflect: 0, absorb: 0 };
    expect(applyPassiveAffinities([], base)).toEqual(base);
  });

  it("applies element_nullify passive to nullify bitmask", () => {
    const base = defaultAffinities();
    const passives = [pe("on_damage_calc", "element_nullify", { value: 1, element: "Fire" })];
    const result = applyPassiveAffinities(passives, base);
    expect(result.nullify & BATTLE_ELEMENTS.Fire).not.toBe(0);
  });

  it("element_nullify removes resist for same element", () => {
    const base = { weak: 0, resist: BATTLE_ELEMENTS.Fire, nullify: 0, reflect: 0, absorb: 0 };
    const passives = [pe("on_damage_calc", "element_nullify", { value: 1, element: "Fire" })];
    const result = applyPassiveAffinities(passives, base);
    expect(result.nullify & BATTLE_ELEMENTS.Fire).not.toBe(0);
    expect(result.resist & BATTLE_ELEMENTS.Fire).toBe(0);
  });

  it("applies element_resist passive to resist bitmask", () => {
    const base = defaultAffinities();
    const passives = [pe("on_damage_calc", "element_resist", { value: -50, element: "Ice" })];
    const result = applyPassiveAffinities(passives, base);
    expect(result.resist & BATTLE_ELEMENTS.Ice).not.toBe(0);
  });

  it("element_resist does not override existing nullify", () => {
    const base = { weak: 0, resist: 0, nullify: BATTLE_ELEMENTS.Fire, reflect: 0, absorb: 0 };
    const passives = [pe("on_damage_calc", "element_resist", { value: -50, element: "Fire" })];
    const result = applyPassiveAffinities(passives, base);
    expect(result.nullify & BATTLE_ELEMENTS.Fire).not.toBe(0);
    expect(result.resist & BATTLE_ELEMENTS.Fire).toBe(0);
  });

  it("skips passives with unknown element", () => {
    const base = defaultAffinities();
    const passives = [pe("on_damage_calc", "element_nullify", { value: 1, element: "Void" })];
    const result = applyPassiveAffinities(passives, base);
    expect(result).toEqual(base);
  });

  it("skips passives not on on_damage_calc hook", () => {
    const base = defaultAffinities();
    const passives = [pe("on_turn_start", "hp_regen", { value: 5 })];
    const result = applyPassiveAffinities(passives, base);
    expect(result).toEqual(base);
  });
});

// ── applyPassivesAtHook ──

describe("applyPassivesAtHook", () => {
  it("applies element_boost to damage context", () => {
    const passives = [pe("on_damage_calc", "element_boost", { value: 25, element: "Fire" })];
    const ctx = applyPassivesAtHook(passives, "on_damage_calc", {
      damage: 100,
      element: "Fire",
      actorHpPercent: 80,
    });
    expect(ctx).toEqual({ damage: 125, element: "Fire", actorHpPercent: 80 });
  });

  it("element_boost only applies to matching element", () => {
    const passives = [pe("on_damage_calc", "element_boost", { value: 25, element: "Fire" })];
    const ctx = applyPassivesAtHook(passives, "on_damage_calc", {
      damage: 100,
      element: "Ice",
      actorHpPercent: 80,
    });
    expect(ctx).toEqual({ damage: 100, element: "Ice", actorHpPercent: 80 });
  });

  it("applies hp_regen on turn start", () => {
    const passives = [pe("on_turn_start", "hp_regen", { value: 5 })];
    const ctx = applyPassivesAtHook(passives, "on_turn_start", {
      hpMax: 200,
      mpMax: 100,
      hpCurrent: 100,
      mpCurrent: 50,
    });
    expect((ctx as { hpCurrent: number }).hpCurrent).toBe(110); // 100 + 5% of 200
  });

  it("hp_regen does not exceed max", () => {
    const passives = [pe("on_turn_start", "hp_regen", { value: 50 })];
    const ctx = applyPassivesAtHook(passives, "on_turn_start", {
      hpMax: 100,
      mpMax: 50,
      hpCurrent: 90,
      mpCurrent: 25,
    });
    expect((ctx as { hpCurrent: number }).hpCurrent).toBe(100);
  });

  it("applies endure on death check", () => {
    const passives = [pe("on_death_check", "endure", { value: 1 })];
    const ctx = applyPassivesAtHook(passives, "on_death_check", {
      hpAfterDamage: -10,
      endureUsed: false,
    });
    expect((ctx as { hpAfterDamage: number; endureUsed: boolean }).hpAfterDamage).toBe(1);
    expect((ctx as { hpAfterDamage: number; endureUsed: boolean }).endureUsed).toBe(true);
  });

  it("endure does not trigger when already used", () => {
    const passives = [pe("on_death_check", "endure", { value: 1 })];
    const ctx = applyPassivesAtHook(passives, "on_death_check", {
      hpAfterDamage: -10,
      endureUsed: true,
    });
    expect((ctx as { hpAfterDamage: number; endureUsed: boolean }).hpAfterDamage).toBe(-10);
  });

  it("endure does not trigger when HP is positive", () => {
    const passives = [pe("on_death_check", "endure", { value: 1 })];
    const ctx = applyPassivesAtHook(passives, "on_death_check", {
      hpAfterDamage: 10,
      endureUsed: false,
    });
    expect((ctx as { hpAfterDamage: number; endureUsed: boolean }).hpAfterDamage).toBe(10);
  });

  it("applies exp_boost", () => {
    const passives = [pe("on_exp_calc", "exp_boost", { value: 25 })];
    const ctx = applyPassivesAtHook(passives, "on_exp_calc", { exp: 100 });
    expect((ctx as { exp: number }).exp).toBe(125);
  });

  it("applies status_boost", () => {
    const passives = [pe("on_status_chance", "status_boost", { value: 50 })];
    const ctx = applyPassivesAtHook(passives, "on_status_chance", { chance: 40 });
    expect((ctx as { chance: number }).chance).toBe(60); // 40 * 1.5 = 60
  });

  it("applies damage_boost with condition met", () => {
    const passives = [pe("on_damage_calc", "damage_boost", {
      value: 50,
      condition: { stat: "hp", threshold: 50, operator: "below" },
    })];
    const ctx = applyPassivesAtHook(passives, "on_damage_calc", {
      damage: 100,
      element: "Physical",
      actorHpPercent: 30,
    });
    expect((ctx as { damage: number }).damage).toBe(150);
  });

  it("damage_boost does not apply when condition not met", () => {
    const passives = [pe("on_damage_calc", "damage_boost", {
      value: 50,
      condition: { stat: "hp", threshold: 50, operator: "below" },
    })];
    const ctx = applyPassivesAtHook(passives, "on_damage_calc", {
      damage: 100,
      element: "Physical",
      actorHpPercent: 80,
    });
    expect((ctx as { damage: number }).damage).toBe(100);
  });

  it("skips passives not matching hook", () => {
    const passives = [pe("on_exp_calc", "exp_boost", { value: 25 })];
    const ctx = applyPassivesAtHook(passives, "on_damage_calc", {
      damage: 100,
      element: "Physical",
      actorHpPercent: 80,
    });
    expect((ctx as { damage: number }).damage).toBe(100);
  });
});

// ── elementBitToName ──

describe("elementBitToName", () => {
  it("returns 'Fire' for Fire bitmask", () => {
    expect(elementBitToName(BATTLE_ELEMENTS.Fire)).toBe("Fire");
  });

  it("returns 'None' for 0", () => {
    expect(elementBitToName(0)).toBe("None");
  });

  it("returns name for Almighty bitmask", () => {
    expect(elementBitToName(BATTLE_ELEMENTS.Almighty)).toBe("Almighty");
  });
});
