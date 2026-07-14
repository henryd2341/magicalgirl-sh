import {
  clearBossProfilesForTests,
  getBossProfile,
  hasBossProfile,
  registerBossProfile,
  type BossProfile,
} from "@/engine/battle/boss/bossRegistry";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import type { BattleSnapshot } from "@/types/battle";
import { beforeEach, describe, expect, it } from "vitest";

function createProfile(id = "test-profile"): BossProfile {
  return {
    id,
    actorEnemyIds: ["100"],
    initialPhase: "phase-1",
    skillIds: ["255"],
    reduceEvent: () => [],
    selectForcedIntent: () => null,
    enumerateUtilityCandidates: () => [],
  };
}

describe("bossRegistry", () => {
  beforeEach(() => {
    clearBossProfilesForTests();
  });

  it("registers and resolves profiles", () => {
    const profile = createProfile();
    registerBossProfile(profile);

    expect(hasBossProfile(profile.id)).toBe(true);
    expect(getBossProfile(profile.id)).toBe(profile);
  });

  it("rejects duplicate registration and missing lookup", () => {
    registerBossProfile(createProfile());

    expect(() => registerBossProfile(createProfile())).toThrow(/already registered/);
    expect(() => getBossProfile("missing")).toThrow(/not registered/);
  });

  it("accepts contexts with serializable runtime state", () => {
    const profile = createProfile();
    const snapshot = {
      bossRuntime: createEmptyBossRuntimeState(),
    } as BattleSnapshot;

    expect(profile.reduceEvent({
      snapshot,
      runtime: snapshot.bossRuntime!,
    }, { type: "battle_started" })).toEqual([]);
  });
});
