import { getChallengeBossSprite } from "@/ui/battle/battleEnemySprites";
import { describe, expect, it } from "vitest";

describe("challenge Boss sprite registry", () => {
  it("registers dedicated and distinct sprites for enemies 100 through 108", () => {
    const sprites = ["100", "101", "102", "103", "104", "105", "106", "107", "108"].map((enemyId) =>
      getChallengeBossSprite(enemyId),
    );

    expect(sprites.every((sprite) => sprite !== "")).toBe(true);
    expect(new Set(sprites)).toHaveLength(9);
  });

  it("leaves non-registered enemies to the existing creature fallback", () => {
    expect(getChallengeBossSprite("109")).toBe("");
    expect(getChallengeBossSprite(undefined)).toBe("");
  });
});
