import { applyPermanentStatBonus } from "@/engine/items/permanentStatService";
import { describe, expect, it } from "vitest";

const combat = {
  allocatedPoints: { attack: 10, defense: 20, agility: 30, intelligence: 40 },
  permanentBonuses: { attack: 2, defense: 0, agility: 0, intelligence: 0 },
};

describe("applyPermanentStatBonus", () => {
  it("adds a permanent point without mutating the input", () => {
    const result = applyPermanentStatBonus(combat, 5, { stat: "attack", amount: 1 });
    expect(result).toEqual({ ok: true, permanentBonuses: { attack: 3, defense: 0, agility: 0, intelligence: 0 }, value: 18 });
    expect(combat.permanentBonuses.attack).toBe(2);
  });

  it("rejects a stat already at the permanent cap", () => {
    const result = applyPermanentStatBonus({ ...combat, allocatedPoints: { ...combat.allocatedPoints, attack: 92 } }, 5, { stat: "attack", amount: 1 });
    expect(result).toEqual({ ok: false, reason: "stat_capped", value: 99 });
  });
});
