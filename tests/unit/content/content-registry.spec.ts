import {
  assertUniqueContentIds,
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
});
