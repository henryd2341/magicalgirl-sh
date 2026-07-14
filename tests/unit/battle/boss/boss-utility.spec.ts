import {
  scoreBossTarget,
  selectBossUtilityCandidate,
} from "@/engine/battle/boss/bossUtility";
import type { BossUtilityCandidate } from "@/engine/battle/boss/bossTypes";
import { describe, expect, it } from "vitest";

function candidate(
  skillId: string,
  score: number,
  stableOrder: number,
  overrides: Partial<BossUtilityCandidate> = {},
): BossUtilityCandidate {
  return {
    intent: {
      type: "use_skill",
      actorId: "enemy-1",
      skillId,
      targetIds: ["player-1"],
      reason: "utility",
    },
    available: true,
    score,
    noise: 0,
    stableOrder,
    ...overrides,
  };
}

describe("bossUtility", () => {
  it("uses stable ordering for deterministic ties", () => {
    const selected = selectBossUtilityCandidate(
      [candidate("256", 10, 2), candidate("255", 10, 1)],
      () => 0.5,
      {},
    );

    expect(selected?.intent).toMatchObject({ skillId: "255" });
  });

  it("applies injected noise and excludes unavailable or cooling candidates", () => {
    const selected = selectBossUtilityCandidate(
      [
        candidate("255", 100, 1, { available: false }),
        candidate("256", 20, 2, { cooldownKey: "enemy-1:256" }),
        candidate("257", 10, 3, { noise: 20 }),
      ],
      () => 0.75,
      { "enemy-1:256": 1 },
    );

    expect(selected?.intent).toMatchObject({ skillId: "257" });
  });

  it("scores low-HP and down targets according to explicit rules", () => {
    expect(
      scoreBossTarget(
        { hp: { current: 10, max: 100 }, isDown: false },
        { hpPreference: "lowest", downBonus: -1000 },
      ),
    ).toBe(90);
    expect(
      scoreBossTarget(
        { hp: { current: 0, max: 100 }, isDown: true },
        { hpPreference: "highest", downBonus: 200 },
      ),
    ).toBe(200);
  });
});
