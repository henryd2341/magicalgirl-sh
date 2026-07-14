import { getEnemy, getSkill } from "@/content/contentRegistry";
import { applyBossEffects } from "@/engine/battle/boss/bossRuntime";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import { eternalFrostBeastProfile } from "@/engine/battle/boss/profiles/eternalFrostBeastProfile";
import type { BattleParticipant, BattleSnapshot } from "@/types/battle";

function enemy(id: string, enemyId: string, hp: number): BattleParticipant {
  return { id, enemyId, side: "enemy", displayName: enemyId, hp: { current: hp, max: hp }, mp: { current: 999, max: 999 }, isDown: false, isActive: true, statusEffects: [] };
}

function snapshot(): BattleSnapshot {
  return {
    turnCount: 1,
    participants: [enemy("beast", "101", 1800), enemy("crystal", "102", 450), enemy("guard", "103", 650), { id: "hero", side: "player", displayName: "主角", hp: { current: 100, max: 100 }, mp: { current: 100, max: 100 }, isDown: false, isActive: true }],
    pressTurn: { ownerSide: "enemy", icons: [{ id: "e-1", state: "solid" }] },
    battleLog: [],
    bossRuntime: {
      ...createEmptyBossRuntimeState(),
      profileIds: { beast: eternalFrostBeastProfile.id, crystal: eternalFrostBeastProfile.id, guard: eternalFrostBeastProfile.id },
      phaseByActorId: { beast: "fortified", crystal: "add", guard: "add" },
      queuedCounters: { beast: null, crystal: null, guard: null },
    },
  } as BattleSnapshot;
}

function event(state: BattleSnapshot, bossEvent: Parameters<typeof eternalFrostBeastProfile.reduceEvent>[1]): BattleSnapshot {
  return applyBossEffects(state, eternalFrostBeastProfile.reduceEvent({ snapshot: state, runtime: state.bossRuntime! }, bossEvent));
}

describe("永冻巨兽", () => {
  it("defines the boss, both adds, and skills 264-273", () => {
    expect(["101", "102", "103"].map((id) => getEnemy(id).bossProfileId)).toEqual(Array(3).fill("eternal-frost-beast"));
    expect(getEnemy("101").stats.hp).toBe(1800);
    expect(Array.from({ length: 10 }, (_, index) => getSkill(String(264 + index)).mpCost)).toEqual(Array(10).fill(0));
  });

  it("charges the crystal, queues its explosion, and resets after use", () => {
    let state = event(snapshot(), { type: "round_started", turnCount: 1 });
    expect(state.bossRuntime?.counters["frost:crystalCharge"]).toBe(1);
    state = event(state, { type: "round_started", turnCount: 2 });
    expect(state.bossRuntime?.queuedCounters.crystal).toBe("270");
    state = event(state, { type: "action_resolved", actorId: "crystal", actionId: "270", targetIds: ["hero"] });
    expect(state.bossRuntime?.counters["frost:crystalCharge"]).toBe(0);
    expect(state.bossRuntime?.queuedCounters.crystal).toBeNull();
  });

  it("protects the lowest ally and grants add-dependent boss reduction", () => {
    const state = snapshot();
    state.participants.find((entry) => entry.id === "crystal")!.hp.current = 100;
    const next = event(state, { type: "round_started", turnCount: 1 });

    expect(next.bossRuntime?.mechanicState["protection:crystal"]).toBe("guard");
    expect(next.participants.find((entry) => entry.id === "crystal")?.statusEffects).toContainEqual(expect.objectContaining({ effectId: "defense_up" }));
    expect(next.bossRuntime?.counters["frost:addReduction"]).toBe(2);
  });

  it("enters phase two at 60 percent and records the first defeated add type", () => {
    let state = snapshot();
    state.participants.find((entry) => entry.id === "beast")!.hp.current = 1080;
    state = event(state, { type: "damage_applied", sourceId: "hero", targetId: "beast", amount: 10, element: 4 });
    expect(state.bossRuntime?.phaseByActorId.beast).toBe("unbound");

    state.participants.find((entry) => entry.id === "crystal")!.isDown = true;
    state = event(state, { type: "participant_down", participantId: "crystal" });
    expect(state.bossRuntime?.lists["frost:firstKillType"]).toEqual(["102"]);
  });

  it("resummons the first-killed add type once with a unique actor id", () => {
    let state = snapshot();
    for (const id of ["crystal", "guard"]) {
      const add = state.participants.find((entry) => entry.id === id)!;
      add.isDown = true;
      state = event(state, { type: "participant_down", participantId: id });
    }
    const intent = eternalFrostBeastProfile.selectPriorityIntent?.({ snapshot: state, runtime: state.bossRuntime!, actorId: "beast" }, "revival");
    expect(intent).toMatchObject({ type: "use_skill", skillId: "268" });

    state = event(state, { type: "action_resolved", actorId: "beast", actionId: "268", targetIds: [] });
    const summoned = state.participants.filter((entry) => entry.enemyId === "102" && entry.id !== "crystal");
    expect(summoned).toHaveLength(1);
    expect(state.bossRuntime?.profileIds[summoned[0]!.id]).toBe("eternal-frost-beast");
    expect(state.pressTurn.icons).toHaveLength(1);
    expect(state.bossRuntime?.flags["frost:resummoned"]).toBe(true);
  });

  it("enters soft enrage on round eight", () => {
    const state = event(snapshot(), { type: "round_started", turnCount: 8 });
    expect(state.bossRuntime?.flags["frost:enraged"]).toBe(true);
    expect(state.participants.find((entry) => entry.id === "beast")?.statusEffects).toContainEqual(expect.objectContaining({ effectId: "attack_up" }));
  });
});
