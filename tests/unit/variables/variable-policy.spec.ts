import {
  createDefaultGameVariablesRoot,
  validateGameVariablesRoot,
  validateVariablePathPatch,
} from "@/engine/variablePolicy";
import { describe, expect, it } from "vitest";

describe("validateVariablePathPatch", () => {
  it("rejects unknown paths outside the whitelist", () => {
    const root = createDefaultGameVariablesRoot();

    expect(() =>
      validateVariablePathPatch(root, {
        path: "world.unknown_field",
        value: "forbidden",
      }),
    ).toThrow(
      "[VARIABLE_UNKNOWN_PATH] Patch path is not allowed: world.unknown_field",
    );
  });

  it("rejects negative player money values", () => {
    const root = createDefaultGameVariablesRoot();

    expect(() =>
      validateVariablePathPatch(root, {
        path: "player.money",
        value: -1,
      }),
    ).toThrow(
      "[VARIABLE_POLICY_VIOLATION] Resource value cannot be negative: player.money",
    );
  });

  it("rejects non-integer inventory item quantities", () => {
    const root = createDefaultGameVariablesRoot();

    expect(() =>
      validateVariablePathPatch(root, {
        path: "inventory.items.potion",
        value: 1.5,
      }),
    ).toThrow(
      "[VARIABLE_POLICY_VIOLATION] Inventory item quantity must be a positive integer: inventory.items.potion",
    );
  });
});

describe("training progress validation", () => {
  it("accepts a legacy root with no training progress", () => {
    const root = createDefaultGameVariablesRoot();
    delete root.training;
    expect(() => validateGameVariablesRoot(root)).not.toThrow();
  });

  it.each([
    [["challenge-1", "challenge-1"], [], false],
    [[""], [], false],
    [[1], [], false],
    [[], ["reward-1", "reward-1"], false],
    [[], [""], false],
    [[], [1], false],
    [[], [], "yes"],
  ])(
    "rejects malformed training progress %#",
    (clearedChallengeIds, claimedRewardIds, hiddenChallengeDiscovered) => {
      const root = createDefaultGameVariablesRoot();
      root.training = {
        clearedChallengeIds,
        claimedRewardIds,
        hiddenChallengeDiscovered,
      } as typeof root.training;
      expect(() => validateGameVariablesRoot(root)).toThrow(
        "[VARIABLE_SCHEMA_INVALID]",
      );
    },
  );

  it("accepts claimed rewards independently from cleared challenges", () => {
    const root = createDefaultGameVariablesRoot();
    root.training = {
      clearedChallengeIds: [],
      claimedRewardIds: ["challenge-1"],
      hiddenChallengeDiscovered: false,
    };
    expect(() => validateGameVariablesRoot(root)).not.toThrow();
  });
});
