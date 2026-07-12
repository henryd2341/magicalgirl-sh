import { createDefaultGameVariablesRoot, createDefaultTrainingProgress, getTrainingProgress } from "@/engine/variablePolicy";
import { describe, expect, it } from "vitest";

describe("training progress helpers", () => {
  it("creates empty training progress in a new game", () => {
    expect(createDefaultGameVariablesRoot().training).toEqual({ clearedChallengeIds: [], claimedRewardIds: [], hiddenChallengeDiscovered: false });
  });

  it("returns an empty default for a legacy root without mutating it", () => {
    const root = createDefaultGameVariablesRoot();
    delete root.training;
    expect(getTrainingProgress(root)).toEqual(createDefaultTrainingProgress());
    expect("training" in root).toBe(false);
  });

  it("creates fresh independent defaults", () => {
    const first = createDefaultTrainingProgress();
    const second = createDefaultTrainingProgress();
    first.clearedChallengeIds.push("challenge-1");
    first.claimedRewardIds.push("reward-1");
    expect(second).toEqual({ clearedChallengeIds: [], claimedRewardIds: [], hiddenChallengeDiscovered: false });
  });

  it("returns a defensive copy of persisted progress", () => {
    const root = createDefaultGameVariablesRoot();
    root.training = { clearedChallengeIds: ["challenge-1"], claimedRewardIds: ["reward-1"], hiddenChallengeDiscovered: true };
    const progress = getTrainingProgress(root);
    progress.clearedChallengeIds.push("challenge-2");
    progress.claimedRewardIds.push("reward-2");
    expect(progress).not.toBe(root.training);
    expect(progress.clearedChallengeIds).not.toBe(root.training.clearedChallengeIds);
    expect(progress.claimedRewardIds).not.toBe(root.training.claimedRewardIds);
    expect(root.training).toEqual({ clearedChallengeIds: ["challenge-1"], claimedRewardIds: ["reward-1"], hiddenChallengeDiscovered: true });
  });
});