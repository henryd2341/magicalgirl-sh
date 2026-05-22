import {
  findNextEligibleActorId,
  normalizeCurrentActorId,
} from "@/engine/battle/battleTurnQueue";
import type { BattleParticipant } from "@/types/battle";
import { describe, expect, it } from "vitest";

const participants: BattleParticipant[] = [
  {
    id: "player-1",
    side: "player",
    displayName: "player-1",
    hp: { current: 10, max: 10 },
    mp: { current: 0, max: 0 },
    isDown: false,
    canAct: true,
    isActive: true,
  },
  {
    id: "player-2",
    side: "player",
    displayName: "player-2",
    hp: { current: 10, max: 10 },
    mp: { current: 0, max: 0 },
    isDown: true,
    canAct: true,
    isActive: true,
  },
  {
    id: "player-3",
    side: "player",
    displayName: "player-3",
    hp: { current: 10, max: 10 },
    mp: { current: 0, max: 0 },
    isDown: false,
    canAct: false,
    isActive: true,
  },
  {
    id: "player-4",
    side: "player",
    displayName: "player-4",
    hp: { current: 10, max: 10 },
    mp: { current: 0, max: 0 },
    isDown: false,
    canAct: true,
    isActive: true,
  },
];

describe("battleTurnQueue", () => {
  it("normalizes current actor by skipping down or disabled members", () => {
    expect(
      normalizeCurrentActorId(
        ["player-1", "player-2", "player-3", "player-4"],
        participants,
        "player-2",
      ),
    ).toBe("player-4");
  });

  it("finds the next eligible actor in circular order", () => {
    expect(
      findNextEligibleActorId(
        ["player-1", "player-2", "player-3", "player-4"],
        participants,
        "player-4",
      ),
    ).toBe("player-1");
  });

  it("returns null when no eligible actor remains in queue", () => {
    expect(
      normalizeCurrentActorId(
        ["player-2", "player-3"],
        participants,
        "player-2",
      ),
    ).toBeNull();
  });
});
