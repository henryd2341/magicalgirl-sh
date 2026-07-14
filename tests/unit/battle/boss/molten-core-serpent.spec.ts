import { getEnemy, getSkill } from "@/content/contentRegistry";
import { applyBossEffects } from "@/engine/battle/boss/bossRuntime";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import { moltenCoreSerpentProfile } from "@/engine/battle/boss/profiles/moltenCoreSerpentProfile";
import { BATTLE_ELEMENTS, type BattleSnapshot } from "@/types/battle";

function createSnapshot(phase: "molten" | "steam" = "molten"): BattleSnapshot {
  return {
    turnCount: 1,
    participants: [
      {
        id: "serpent",
        enemyId: "100",
        side: "enemy",
        displayName: "熔核幻蛇",
        hp: { current: 700, max: 700 },
        mp: { current: 999, max: 999 },
        isDown: false,
        isActive: true,
        statusEffects: [],
        affinities: { weak: BATTLE_ELEMENTS.Ice, resist: BATTLE_ELEMENTS.Fire, nullify: 0, reflect: 0, absorb: 0 },
      },
      {
        id: "hero",
        side: "player",
        displayName: "主角",
        hp: { current: 100, max: 100 },
        mp: { current: 100, max: 100 },
        isDown: false,
        isActive: true,
      },
    ],
    battleLog: [],
    bossRuntime: {
      ...createEmptyBossRuntimeState(),
      profileIds: { serpent: moltenCoreSerpentProfile.id },
      phaseByActorId: { serpent: phase },
    },
  } as BattleSnapshot;
}

function applyEvent(snapshot: BattleSnapshot, event: Parameters<typeof moltenCoreSerpentProfile.reduceEvent>[1]): BattleSnapshot {
  return applyBossEffects(snapshot, moltenCoreSerpentProfile.reduceEvent({ snapshot, runtime: snapshot.bossRuntime! }, event));
}

describe("熔核幻蛇", () => {
  it("defines enemy 100 and exclusive skills 255-263", () => {
    expect(getEnemy("100")).toMatchObject({ name: "熔核幻蛇", baseLevel: 20, bossProfileId: "molten-core-serpent", expReward: 0, moneyReward: 0 });
    expect(Array.from({ length: 9 }, (_, index) => getSkill(String(255 + index)).mpCost)).toEqual(Array(9).fill(0));
  });

  it("switches from molten to steam after Ice damage and exposes steam affinities", () => {
    const next = applyEvent(createSnapshot(), { type: "damage_applied", sourceId: "hero", targetId: "serpent", amount: 100, element: BATTLE_ELEMENTS.Ice });

    expect(next.bossRuntime?.phaseByActorId.serpent).toBe("steam");
    expect(next.participants[0]?.affinities).toEqual({ weak: BATTLE_ELEMENTS.Electric, resist: 0, nullify: BATTLE_ELEMENTS.Ice, reflect: 0, absorb: BATTLE_ELEMENTS.Fire });
    expect(next.battleLog?.at(-1)?.summary).toContain("蒸汽形态");
  });

  it("returns to molten on Electric damage with one-round defense down", () => {
    const next = applyEvent(createSnapshot("steam"), { type: "damage_applied", sourceId: "hero", targetId: "serpent", amount: 100, element: BATTLE_ELEMENTS.Electric });

    expect(next.bossRuntime?.phaseByActorId.serpent).toBe("molten");
    expect(next.participants[0]?.affinities).toEqual({ weak: BATTLE_ELEMENTS.Ice, resist: BATTLE_ELEMENTS.Fire, nullify: 0, reflect: 0, absorb: 0 });
    expect(next.participants[0]?.statusEffects).toContainEqual({ effectId: "defense_down", remainingDuration: 1, stacks: 1 });
    expect(next.battleLog?.filter((entry) => entry.kind === "mechanic")).toHaveLength(1);
  });

  it("telegraphs then forces 263 after one ordinary action", () => {
    let snapshot = applyEvent(createSnapshot(), { type: "round_started", turnCount: 4 });
    expect(moltenCoreSerpentProfile.selectForcedIntent({ snapshot, runtime: snapshot.bossRuntime!, actorId: "serpent" })).toBeNull();

    snapshot = applyEvent(snapshot, { type: "action_resolved", actorId: "serpent", actionId: "256", targetIds: ["hero"] });
    expect(moltenCoreSerpentProfile.selectForcedIntent({ snapshot, runtime: snapshot.bossRuntime!, actorId: "serpent" })).toMatchObject({ type: "use_skill", skillId: "263" });
  });

  it("keeps event skills outside utility and changes priorities by form", () => {
    const molten = createSnapshot();
    const steam = createSnapshot("steam");
    const moltenIds = moltenCoreSerpentProfile.enumerateUtilityCandidates({ snapshot: molten, runtime: molten.bossRuntime!, actorId: "serpent" }).map((candidate) => candidate.intent.type === "use_skill" ? candidate.intent.skillId : "pass");
    const steamIds = moltenCoreSerpentProfile.enumerateUtilityCandidates({ snapshot: steam, runtime: steam.bossRuntime!, actorId: "serpent" }).map((candidate) => candidate.intent.type === "use_skill" ? candidate.intent.skillId : "pass");

    expect(moltenIds).not.toEqual(expect.arrayContaining(["255", "259", "262"]));
    expect(moltenIds).toEqual(expect.arrayContaining(["256", "257", "258"]));
    expect(steamIds).toEqual(expect.arrayContaining(["260", "261"]));
  });
});
