import { getEnemy, getSkill } from "@/content/contentRegistry";
import { applyBossEffects } from "@/engine/battle/boss/bossRuntime";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import { corruptedCrownSaintProfile } from "@/engine/battle/boss/profiles/corruptedCrownSaintProfile";
import type { BattleSnapshot } from "@/types/battle";

function snapshot(): BattleSnapshot {
  return { turnCount: 1, participants: [
    { id: "saint", enemyId: "104", side: "enemy", displayName: "腐冠圣女", hp: { current: 3200, max: 3200 }, mp: { current: 999, max: 999 }, isDown: false, isActive: true, statusEffects: [] },
    { id: "hero", side: "player", displayName: "主角", hp: { current: 100, max: 100 }, mp: { current: 100, max: 100 }, isDown: false, isActive: true, statusEffects: [{ effectId: "burn", remainingDuration: 2, stacks: 1 }, { effectId: "blind", remainingDuration: 2, stacks: 1 }] },
  ], battleLog: [], bossRuntime: { ...createEmptyBossRuntimeState(), profileIds: { saint: corruptedCrownSaintProfile.id }, phaseByActorId: { saint: "sow" } } } as BattleSnapshot;
}
function event(state: BattleSnapshot, value: Parameters<typeof corruptedCrownSaintProfile.reduceEvent>[1]) { return applyBossEffects(state, corruptedCrownSaintProfile.reduceEvent({ snapshot: state, runtime: state.bossRuntime! }, value)); }
function forced(state: BattleSnapshot) { return corruptedCrownSaintProfile.selectForcedIntent({ snapshot: state, runtime: state.bossRuntime!, actorId: "saint" }); }

describe("腐冠圣女", () => {
  it("defines enemy 104 and skills 274-283 without a new status", () => {
    expect(getEnemy("104")).toMatchObject({ name: "腐冠圣女", bossProfileId: "corrupted-crown-saint" });
    expect(Array.from({ length: 10 }, (_, i) => getSkill(String(274 + i)).mpCost)).toEqual(Array(10).fill(0));
  });
  it("forces sow, grow, harvest in order and counts existing ailments/dots as seeds", () => {
    let state = event(snapshot(), { type: "before_enemy_action", actorId: "saint" });
    expect(state.bossRuntime?.counters["crown:seedCount"]).toBe(2);
    expect(forced(state)).toMatchObject({ skillId: "274" });
    state = event(state, { type: "action_resolved", actorId: "saint", actionId: "274", targetIds: ["hero"] });
    expect(forced(state)).toMatchObject({ skillId: "278" });
    state = event(state, { type: "action_resolved", actorId: "saint", actionId: "278", targetIds: ["hero"] });
    expect(forced(state)).toMatchObject({ skillId: "279" });
  });
  it("uses枯败收割 at the debuff threshold and tracks burn or poison backlash", () => {
    let state = snapshot();
    state.participants[0]!.statusEffects = ["attack_down", "defense_down", "agility_down"].map((effectId) => ({ effectId, remainingDuration: 2, stacks: 1 }));
    state.bossRuntime!.phaseByActorId.saint = "harvest";
    expect(forced(state)).toMatchObject({ skillId: "280" });
    state = event(state, { type: "status_applied", sourceId: "hero", targetId: "saint", effectId: "poison" });
    expect(state.bossRuntime?.flags["crown:backlash"]).toBe(true);
  });
  it("advances at 65 and 35 percent and shortens the cycle from round ten", () => {
    let state = snapshot();
    state.participants[0]!.hp.current = 2080;
    state = event(state, { type: "damage_applied", sourceId: "hero", targetId: "saint", amount: 1, element: 4 });
    expect(state.bossRuntime?.flags["crown:expandedSow"]).toBe(true);
    state.participants[0]!.hp.current = 1120;
    state = event(state, { type: "damage_applied", sourceId: "hero", targetId: "saint", amount: 1, element: 4 });
    expect(state.bossRuntime?.flags["crown:reverseCrown"]).toBe(true);
    state = event(state, { type: "round_started", turnCount: 10 });
    expect(state.bossRuntime?.flags["crown:earlyBloom"]).toBe(true);
    state.bossRuntime!.phaseByActorId.saint = "sow";
    state = event(state, { type: "action_resolved", actorId: "saint", actionId: "274", targetIds: ["hero"] });
    expect(state.bossRuntime?.phaseByActorId.saint).toBe("harvest");
  });
});
