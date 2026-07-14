import { getEnemy, getSkill } from "@/content/contentRegistry";
import { applyBossEffects } from "@/engine/battle/boss/bossRuntime";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import { echoHunterProfile } from "@/engine/battle/boss/profiles/echoHunterProfile";
import { BATTLE_ELEMENTS, type BattleSnapshot } from "@/types/battle";

function snapshot(): BattleSnapshot { return { turnCount: 1, participants: [
  { id: "hunter", enemyId: "105", side: "enemy", displayName: "回声猎手", hp: { current: 5000, max: 5000 }, mp: { current: 999, max: 999 }, isDown: false, isActive: true },
  { id: "hero", side: "player", displayName: "主角", hp: { current: 100, max: 100 }, mp: { current: 100, max: 100 }, isDown: false, isActive: true },
  { id: "ally", side: "player", displayName: "同伴", hp: { current: 100, max: 100 }, mp: { current: 100, max: 100 }, isDown: false, isActive: true },
], battleLog: [], bossRuntime: { ...createEmptyBossRuntimeState(), profileIds: { hunter: echoHunterProfile.id }, phaseByActorId: { hunter: "single" } } } as BattleSnapshot; }
function event(state: BattleSnapshot, value: Parameters<typeof echoHunterProfile.reduceEvent>[1]) { return applyBossEffects(state, echoHunterProfile.reduceEvent({ snapshot: state, runtime: state.bossRuntime! }, value)); }

describe("回声猎手", () => {
  it("defines enemy 105 and skills 284-293", () => { expect(getEnemy("105").bossProfileId).toBe("echo-hunter"); expect(Array.from({ length: 10 }, (_, i) => getSkill(String(284 + i)).mpCost)).toEqual(Array(10).fill(0)); });
  it("records only at completed round with stable first-occurrence ties and public logs", () => {
    let state = snapshot();
    state = event(state, { type: "damage_applied", sourceId: "hero", targetId: "hunter", amount: 10, element: BATTLE_ELEMENTS.Fire });
    state = event(state, { type: "damage_applied", sourceId: "ally", targetId: "hunter", amount: 10, element: BATTLE_ELEMENTS.Ice });
    expect(state.bossRuntime?.mechanicState["echo:archives"]).toBeUndefined();
    state = event(state, { type: "round_ended", turnCount: 1 });
    expect(state.bossRuntime?.mechanicState["echo:archives"]).toEqual([expect.objectContaining({ element: BATTLE_ELEMENTS.Fire })]);
    expect(state.battleLog?.at(-1)?.summary).toContain("回声档案");
  });
  it("adds dimensions by phase and keeps two completed archives below 40 percent", () => {
    let state = snapshot(); state.participants[0]!.hp.current = 3500;
    state = event(state, { type: "damage_applied", sourceId: "hero", targetId: "hunter", amount: 1, element: BATTLE_ELEMENTS.Fire });
    expect(state.bossRuntime?.phaseByActorId.hunter).toBe("dual");
    state.participants[0]!.hp.current = 2000;
    state = event(state, { type: "damage_applied", sourceId: "hero", targetId: "hunter", amount: 1, element: BATTLE_ELEMENTS.Ice });
    expect(state.bossRuntime?.phaseByActorId.hunter).toBe("archive");
    state = event(state, { type: "action_resolved", actorId: "hero", actionId: "guard", targetIds: ["hero"] });
    state = event(state, { type: "round_ended", turnCount: 1 });
    state = event(state, { type: "action_resolved", actorId: "hero", actionId: "pass", targetIds: ["ally"] });
    state = event(state, { type: "round_ended", turnCount: 2 });
    expect((state.bossRuntime?.mechanicState["echo:archives"] as unknown[])).toHaveLength(2);
    expect((state.bossRuntime?.mechanicState["echo:archives"] as Array<Record<string, unknown>>).at(-1)).toMatchObject({ actionCategory: "pass", favoredParticipantId: "ally" });
  });
  it("selects counter actions 285-292 from the public archive", () => {
    const state = snapshot(); state.bossRuntime!.phaseByActorId.hunter = "archive"; state.bossRuntime!.mechanicState["echo:archives"] = [{ element: BATTLE_ELEMENTS.Fire, actionCategory: "guard", favoredParticipantId: "hero", remainingRounds: 2 }];
    const candidates = echoHunterProfile.enumerateUtilityCandidates({ snapshot: state, runtime: state.bossRuntime!, actorId: "hunter" });
    expect(candidates.map((candidate) => candidate.intent.type === "use_skill" ? candidate.intent.skillId : "")).toEqual(expect.arrayContaining(["285", "290", "292"]));
    expect((candidates.find((candidate) => candidate.intent.type === "use_skill" && candidate.intent.skillId === "292")?.intent as { targetIds: string[] }).targetIds).toEqual(["hero"]);
  });
});
