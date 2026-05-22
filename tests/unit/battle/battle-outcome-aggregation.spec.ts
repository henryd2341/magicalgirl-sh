import { aggregatePressTurnOutcome } from "@/engine/battle/battleOutcomeAggregation";
import type { BattleActionOutcome } from "@/types/battle";
import { describe, expect, it } from "vitest";

function createOutcome(
  type: BattleActionOutcome["type"],
  tags: BattleActionOutcome["tags"] = [],
): BattleActionOutcome {
  return {
    type,
    tags,
    actorId: "player-1",
    finalTargetId: "enemy-1",
  };
}

describe("battleOutcomeAggregation", () => {
  it("rewards only once when multiple targets are weak", () => {
    expect(
      aggregatePressTurnOutcome([
        createOutcome("hit", ["weak"]),
        createOutcome("hit", ["weak"]),
      ]),
    ).toEqual({ outcomeType: "hit", tags: ["weak"] });
  });

  it("lets miss or block override weak rewards", () => {
    expect(
      aggregatePressTurnOutcome([
        createOutcome("hit", ["weak"]),
        createOutcome("miss"),
      ]),
    ).toEqual({ outcomeType: "miss", tags: [] });
  });

  it("lets reflect override every other outcome", () => {
    expect(
      aggregatePressTurnOutcome([
        createOutcome("hit", ["weak"]),
        createOutcome("reflect"),
        createOutcome("miss"),
      ]),
    ).toEqual({ outcomeType: "reflect", tags: [] });
  });

  it("keeps status_no_effect only when no stronger result exists", () => {
    expect(
      aggregatePressTurnOutcome([createOutcome("status_no_effect")]),
    ).toEqual({
      outcomeType: "status_no_effect",
      tags: [],
    });
  });
});
