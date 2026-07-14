import { getEnemy, getSkill } from "@/content/contentRegistry";
import { applyBossEffects } from "@/engine/battle/boss/bossRuntime";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import { chaosDollProfile } from "@/engine/battle/boss/profiles/chaosDollProfile";
import { BATTLE_ELEMENTS, type BattleSnapshot } from "@/types/battle";
function snapshot(): BattleSnapshot { return { turnCount: 1, participants: [{ id: "doll", enemyId: "106", side: "enemy", displayName: "混乱玩偶拼凑体", hp: { current: 8500, max: 8500 }, mp: { current: 999, max: 999 }, isDown: false, isActive: true, statusEffects: [] }, { id: "hero", side: "player", displayName: "主角", hp: { current: 100, max: 100 }, mp: { current: 100, max: 100 }, isDown: false, isActive: true }], battleLog: [], bossRuntime: { ...createEmptyBossRuntimeState(), profileIds: { doll: chaosDollProfile.id }, phaseByActorId: { doll: "integrity" } } } as BattleSnapshot; }
function event(state: BattleSnapshot, value: Parameters<typeof chaosDollProfile.reduceEvent>[1]) { return applyBossEffects(state, chaosDollProfile.reduceEvent({ snapshot: state, runtime: state.bossRuntime! }, value)); }
function integrity(state: BattleSnapshot) { return state.bossRuntime?.mechanicState["doll:integrity"] as { blade: number; eye: number; core: number }; }
describe("混乱玩偶拼凑体", () => {
  it("defines enemy 106 and skills 294-305", () => { expect(getEnemy("106").bossProfileId).toBe("chaos-doll"); expect(Array.from({ length: 12 }, (_, i) => getSkill(String(294 + i)).mpCost)).toEqual(Array(12).fill(0)); });
  it("publishes integer integrity and routes physical, magical Almighty, and debuffs", () => {
    let state = event(snapshot(), { type: "round_started", turnCount: 1 }); expect(integrity(state)).toEqual({ blade: 1000, eye: 1000, core: 1000 });
    state = event(state, { type: "damage_applied", sourceId: "hero", targetId: "doll", amount: 850, element: BATTLE_ELEMENTS.Physical, actionCategory: "physical" });
    state = event(state, { type: "damage_applied", sourceId: "hero", targetId: "doll", amount: 425, element: BATTLE_ELEMENTS.Almighty, actionCategory: "magic" });
    state = event(state, { type: "status_applied", sourceId: "hero", targetId: "doll", effectId: "defense_down" });
    expect(integrity(state)).toEqual({ blade: 900, eye: 950, core: 800 });
  });
  it("uses fixed blade-eye-core tie order and all three phase-two combinations", () => {
    const expected = { blade: "301", eye: "302", core: "300" };
    for (const [broken, skillId] of Object.entries(expected)) {
      const state = snapshot(); state.participants[0]!.hp.current = 5950; state.bossRuntime!.mechanicState["doll:integrity"] = { blade: broken === "blade" ? 100 : 500, eye: broken === "eye" ? 100 : 500, core: broken === "core" ? 100 : 500 };
      const next = event(state, { type: "damage_applied", sourceId: "hero", targetId: "doll", amount: 1, element: BATTLE_ELEMENTS.Fire, actionCategory: "magic" });
      expect(next.bossRuntime?.mechanicState["doll:brokenPart"]).toBe(broken);
      expect(chaosDollProfile.selectForcedIntent({ snapshot: next, runtime: next.bossRuntime!, actorId: "doll" })).toMatchObject({ skillId });
    }
    const tied = snapshot(); tied.participants[0]!.hp.current = 5950; tied.bossRuntime!.mechanicState["doll:integrity"] = { blade: 100, eye: 100, core: 100 };
    expect(event(tied, { type: "damage_applied", sourceId: "hero", targetId: "doll", amount: 1, element: 4 }).bossRuntime?.mechanicState["doll:brokenPart"]).toBe("blade");
  });
  it("starts a four-round phase-three timer and forces 305 at expiry", () => {
    let state = snapshot(); state.bossRuntime!.phaseByActorId.doll = "recombined"; state.participants[0]!.hp.current = 2975;
    state = event(state, { type: "damage_applied", sourceId: "hero", targetId: "doll", amount: 1, element: 4, actionCategory: "magic" });
    expect(state.bossRuntime?.counters["doll:finalRounds"]).toBe(4);
    for (let round = 1; round <= 4; round++) state = event(state, { type: "round_started", turnCount: round });
    expect(chaosDollProfile.selectPriorityIntent?.({ snapshot: state, runtime: state.bossRuntime!, actorId: "doll" }, "hard_defeat")).toMatchObject({ type: "force_defeat", skillId: "305" });
  });
});

