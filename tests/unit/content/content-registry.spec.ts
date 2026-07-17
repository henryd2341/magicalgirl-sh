import {
  assertUniqueContentIds,
  getItem,
  getSkill,
  isChallengeEnemyId,
  isEnemyExclusiveSkillId,
} from "@/content/contentRegistry";
import { describe, expect, it } from "vitest";

describe("challenge content ID boundaries", () => {
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
