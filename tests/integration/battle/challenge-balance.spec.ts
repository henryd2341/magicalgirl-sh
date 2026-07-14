import { simulateChallenge, type ChallengePolicy } from "../../helpers/challengeSimulation";
import { describe, expect, it } from "vitest";

const SEEDS = [7, 19, 43, 71, 101];
const POLICIES: ChallengePolicy[] = ["burst", "balanced", "control", "sustain"];
const NORMAL_CHALLENGES = ["challenge-1", "challenge-2", "challenge-3", "challenge-4", "challenge-5"];

describe("challenge seeded balance simulations", () => {
  for (const challengeId of NORMAL_CHALLENGES) {
    it(`${challengeId} is deterministic, preserves invariants, and supports at least two policies`, () => {
      const matrix = POLICIES.map(policy => ({
        policy,
        results: SEEDS.map(seed => simulateChallenge(challengeId, policy, seed)),
      }));
      for (const row of matrix) {
        for (const result of row.results) expect(result.invariantErrors).toEqual([]);
      }
      const repeat = simulateChallenge(challengeId, "burst", SEEDS[0]!);
      expect(repeat.outcome).toBe(matrix[0]!.results[0]!.outcome);
      expect(repeat.turns).toBe(matrix[0]!.results[0]!.turns);
      const winningPolicies = matrix.filter(row => row.results.some(result => result.outcome === "victory"));
      expect(winningPolicies.length).toBeGreaterThanOrEqual(2);
    });
  }

  it("keeps the hidden pair's locked checks and produces a reproducible expert baseline", () => {
    const first = simulateChallenge("challenge-hidden", "burst", 43);
    const repeat = simulateChallenge("challenge-hidden", "burst", 43);
    expect(first.invariantErrors).toEqual([]);
    expect({ outcome: first.outcome, turns: first.turns }).toEqual({ outcome: repeat.outcome, turns: repeat.turns });
    expect(first.snapshot.battleLog).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "mechanic", summary: expect.stringMatching(/DPS|天地交灼|终末地平/) }),
    ]));
  });
});
