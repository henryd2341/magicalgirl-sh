import {
  assertUniqueContentIds,
  getItem,
  getSkill,
  getAllSkills,
  isChallengeEnemyId,
  isEnemyExclusiveSkillId,
  getStatusEffect,
  getStatusEffectMap,
  statusEffectContentSchema,
} from "@/content/contentRegistry";
import skillsRaw from "@/content/skills.jsonl?raw";
import { describe, expect, it, vi } from "vitest";

describe("challenge content ID boundaries", () => {
  it("reserves accuracy 200 for the eight guaranteed offensive skills and piercing for 164", () => {
    const skills = [...getAllSkills().values()];
    expect(skills.filter((skill) => ["physical", "magic"].includes(skill.category) && skill.accuracy === 200)
      .map((skill) => skill.id)).toEqual(["42", "49", "56", "63", "70", "77", "84", "170"]);
    expect(skills.filter((skill) => skill.pierceResistanceWhenCharged).map((skill) => skill.id)).toEqual(["164"]);
    for (const id of ["25", "31", "34"]) expect(getSkill(id).accuracy).toBe(100);
  });

  it.each([
    { accuracy: -1 }, { accuracy: 201 }, { pierceResistanceWhenCharged: "true" },
  ])("rejects invalid attack metadata %j at the skill-loading boundary", async (fields) => {
    vi.resetModules();
    vi.doMock("@/content/skills.jsonl?raw", () => ({
      default: JSON.stringify({ ...JSON.parse(skillsRaw.split("\n")[0]!), ...fields }),
    }));
    try {
      const isolated = await import("@/content/contentRegistry");
      expect(() => isolated.getAllSkills()).toThrow(/\[skills.jsonl\] Line 1:/);
    } finally {
      vi.doUnmock("@/content/skills.jsonl?raw");
      vi.resetModules();
    }
  });

  it("loads every bundled skill and separates seven dispellable buffs from all 21 shields", () => {
    expect(getAllSkills().size).toBe(skillsRaw.trim().split("\n").length);
    for (const id of ["175", "187", "325"]) expect(getSkill(id).cleanses).toEqual(["buff"]);
    expect(getSkill("297").healPercent).toBe(10);
    const statuses = [...getStatusEffectMap().values()];
    expect(statuses.filter((effect) => effect.type === "buff").map((effect) => effect.id).sort()).toEqual([
      "agility_up", "attack_up", "chant", "charge", "defense_up", "focus", "intelligence_up",
    ]);
    const shields = statuses.filter((effect) => effect.type === "shield");
    expect(shields.map((effect) => effect.id).sort()).toEqual([
      "fire_null", "fire_reflect", "fire_absorb", "ice_null", "ice_reflect", "ice_absorb",
      "wind_null", "wind_reflect", "wind_absorb", "electric_null", "electric_reflect", "electric_absorb",
      "earth_null", "earth_reflect", "earth_absorb", "element_null", "physical_null",
      "physical_reflect", "physical_absorb", "ailment_null", "guard",
    ].sort());
    for (const shield of shields) expect(shield).toMatchObject({ duration: 1, stackable: false });
    expect(statusEffectContentSchema.safeParse({ ...shields[0], type: "unknown" }).success).toBe(false);
  });

  it.each(["shield", "unknown"])("rejects %s cleansing at the real skill-loading boundary", async (cleanse) => {
    vi.resetModules();
    vi.doMock("@/content/skills.jsonl?raw", () => ({
      default: JSON.stringify({ ...JSON.parse(skillsRaw.split("\n")[0]!), cleanses: [cleanse] }),
    }));
    try {
      const isolated = await import("@/content/contentRegistry");
      expect(() => isolated.getAllSkills()).toThrow(/\[skills.jsonl\] Line 1:[\s\S]*cleanses/);
    } finally {
      vi.doUnmock("@/content/skills.jsonl?raw");
      vi.resetModules();
    }
  });

  it("keeps all 40 status IDs and validates the optional final-hit multiplier", () => {
    expect(getStatusEffectMap().size).toBe(40);
    const blind = getStatusEffect("blind");
    expect(blind.hitRateMultiplier).toBe(0.5);
    for (const hitRateMultiplier of [0, 0.5, 1, undefined]) {
      expect(statusEffectContentSchema.safeParse({ ...blind, hitRateMultiplier }).success).toBe(true);
    }
    for (const hitRateMultiplier of [-0.1, 1.1, Infinity, -Infinity, NaN]) {
      expect(statusEffectContentSchema.safeParse({ ...blind, hitRateMultiplier }).success).toBe(false);
    }
  });
  it("reserves numeric enemy IDs from 100 and skill IDs from 255", () => {
    expect(isChallengeEnemyId("100")).toBe(true);
    expect(isChallengeEnemyId("099")).toBe(false);
    expect(isChallengeEnemyId("boss-100")).toBe(false);
    expect(isEnemyExclusiveSkillId("255")).toBe(true);
    expect(isEnemyExclusiveSkillId("254")).toBe(false);
  });

  it("rejects duplicate IDs before a content map is constructed", () => {
    expect(() =>
      assertUniqueContentIds(
        [{ id: "100" }, { id: "100" }],
        "enemies.jsonl",
      ),
    ).toThrow(/Duplicate content id "100"/);
  });

  it("loads drain metadata and permanent-stat incense definitions", () => {
    expect(getSkill("179").hpDrainPercent).toBe(100);
    expect(getSkill("180").mpDrainAmount).toBe(10);

    expect(["66", "67", "68", "69"].map((id) => getItem(id))).toMatchObject([
      { name: "力量之香", price: 20000, usableInBattle: false, permanentStatBonus: { stat: "attack", amount: 1 } },
      { name: "守护之香", price: 20000, usableInBattle: false, permanentStatBonus: { stat: "defense", amount: 1 } },
      { name: "疾风之香", price: 20000, usableInBattle: false, permanentStatBonus: { stat: "agility", amount: 1 } },
      { name: "智慧之香", price: 20000, usableInBattle: false, permanentStatBonus: { stat: "intelligence", amount: 1 } },
    ]);
  });});
