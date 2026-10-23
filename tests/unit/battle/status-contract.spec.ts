import * as content from "@/content/contentRegistry";
import * as enemyUtility from "@/engine/battle/enemyUtility";
import {
  buildAttackOutcomes,
  refreshBattleStatus,
  resolveNextEnemyAction,
  resolveSelectedBattleAction,
  resolveSelectedBattleActionToResolution,
} from "@/engine/battle/battleResolver";
import { expireSidePhase } from "@/engine/battle/statusEffectEngine";
import { applyBossEffects } from "@/engine/battle/boss/bossRuntime";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import { useBattleStore } from "@/stores/battleStore";
import { BATTLE_ELEMENTS, type ActiveStatusEffect, type BattleParticipant, type BattleSnapshot } from "@/types/battle";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function status(effectId: string, duration = content.getStatusEffect(effectId).duration): ActiveStatusEffect {
  return { effectId, remainingDuration: duration, stacks: 1 };
}

function participant(id: string, side: "player" | "enemy", extra: Partial<BattleParticipant> = {}): BattleParticipant {
  return {
    id, side, displayName: id, level: 10,
    hp: { current: 1000, max: 1000 }, mp: { current: 1000, max: 1000 },
    attack: 10, defense: 10, agility: 10, intelligence: 10,
    isActive: true, isDown: false, statusEffects: [],
    ...extra,
  };
}

function battle(players = [participant("p", "player")], enemies = [participant("e", "enemy")]): BattleSnapshot {
  return {
    lifecycleState: "ACTIVE", phase: "PLAYER_COMMAND", encounterId: "status-contract", source: "story",
    participants: [...players, ...enemies], turnCount: 1,
    currentActorId: players[0]!.id, selectedTargetId: enemies[0]!.id, selectedActionId: "attack",
    pressTurn: { ownerSide: "player", icons: [{ id: "one", state: "solid" }, { id: "two", state: "solid" }] },
    pressTurnAllocation: { participantIds: players.map((p) => p.id), initialIconCount: 2 },
  };
}

function cast(snapshot: BattleSnapshot, skillId: string, targetId = "e"): BattleSnapshot {
  return resolveSelectedBattleAction({
    ...snapshot, selectedActionId: "basic-skill", selectedContentId: skillId, selectedTargetId: targetId,
  });
}

function get(snapshot: BattleSnapshot, id: string): BattleParticipant {
  return snapshot.participants.find((p) => p.id === id)!;
}

function enemyCast(snapshot: BattleSnapshot, skillId: string, targetId = "p"): BattleSnapshot {
  vi.spyOn(enemyUtility, "selectEnemyAction").mockImplementation((actor, participants) => ({
    action: enemyUtility.buildEnemySkillAction(skillId)!,
    target: participants.find((p) => p.id === targetId) ?? actor,
    score: 1,
  }));
  return resolveNextEnemyAction({
    ...snapshot, phase: "ENEMY_TURN", currentActorId: "e",
    pressTurn: { ownerSide: "enemy", icons: [{ id: "e-one", state: "solid" }, { id: "e-two", state: "solid" }] },
    pressTurnAllocation: { participantIds: ["e"], initialIconCount: 2 },
  });
}

function finishEnemy(snapshot: BattleSnapshot): BattleSnapshot {
  return resolveNextEnemyAction({
    ...snapshot, phase: "ENEMY_TURN",
    pressTurn: { ownerSide: "enemy", icons: [] },
    pressTurnAllocation: { participantIds: ["e"], initialIconCount: 1 },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => vi.restoreAllMocks());

describe("approved status lifecycle", () => {
  it("seals only positive-MP skills at player and enemy execution/candidate gates", () => {
    const snapshot = battle([participant("p", "player", { statusEffects: [status("seal")] })]);
    const blocked = resolveSelectedBattleActionToResolution({
      ...snapshot, selectedActionId: "basic-skill", selectedContentId: "36",
    });
    expect(blocked.validationError).toBe("skill_sealed");
    expect(resolveSelectedBattleActionToResolution(snapshot).ok).toBe(true);
    expect(resolveSelectedBattleActionToResolution({
      ...snapshot, selectedActionId: "basic-skill", selectedContentId: "277",
    }).ok).toBe(true);
    const enemy = participant("e", "enemy", { statusEffects: [status("seal")], skillIds: ["36"] });
    expect(enemyUtility.selectEnemyAction(enemy, [get(snapshot, "p"), enemy])?.action.skillId).toBeUndefined();
    const sealedEnemy = battle(undefined, [enemy]);
    expect(get(enemyCast(sealedEnemy, "36"), "p").hp.current).toBe(1000);
    expect(get(enemyCast(sealedEnemy, "277"), "p").hp.current).toBeLessThan(1000);
  });

  it("marks sealed menu skills and keeps zero-MP commands selectable", () => {
    const store = useBattleStore();
    store.activeBattle = battle([participant("p", "player", {
      statusEffects: [status("seal")], availableSkillIds: new Set(["0", "36", "130", "277"]),
    })]);
    store.rebuildActionMenuForActor("p");
    const nodes = store.activeBattle.actionMenu!.flatMap((node) => node.children ?? [node]);
    expect(nodes.find((node) => node.contentId === "36")).toMatchObject({ disabled: true });
    expect(nodes.find((node) => node.contentId === "277")?.disabled).not.toBe(true);
    const sealedNode = nodes.find((node) => node.contentId === "36")!;
    store.selectMenuNode(sealedNode.id);
    expect(store.activeBattle.selectedActionId).toBeNull();
  });

  it.each(["0", "36", "164"])("blind halves final hit probability for basic/physical/magic skill %s", (id) => {
    const skill = content.getSkill(id);
    const actor = participant("p", "player", { statusEffects: [status("blind")] });
    const input = {
      actorId: actor.id, actor, targetId: "e", target: participant("e", "enemy"),
      skillPower: skill.power, skillElement: skill.element, skillAccuracy: 200,
      statDriver: skill.statDriver, skillCategory: skill.category,
    };
    expect(buildAttackOutcomes(input)[0]!.type).toBe("miss");
    expect(buildAttackOutcomes({ ...input, actor: { ...actor, statusEffects: [] } })[0]!.type).toBe("hit");
  });

  it("blind leaves support chance alone and applies through enemy attacks", () => {
    const blindPlayer = participant("p", "player", { statusEffects: [status("blind")] });
    expect(get(cast(battle([blindPlayer]), "189"), "e").statusEffects).toEqual(
      expect.arrayContaining([expect.objectContaining({ effectId: "sleep" })]),
    );
    const blindEnemy = participant("e", "enemy", { statusEffects: [status("blind")] });
    expect(get(enemyCast(battle(undefined, [blindEnemy]), "36"), "p").hp.current).toBe(1000);
  });

  it("freeze disables immediately and covers the next complete affected phase", () => {
    vi.mocked(Math.random).mockReturnValue(0);
    let snapshot = cast(battle(), "45");
    expect(get(snapshot, "e").canAct).toBe(false);
    expect(get(snapshot, "e").statusEffects).toContainEqual({
      ...status("freeze"), firstTickPhase: 1,
    });
    for (let action = 0; action < 4 && snapshot.phase === "PLAYER_COMMAND"; action++) {
      snapshot = resolveSelectedBattleAction({ ...snapshot, selectedActionId: "pass" });
    }
    expect(snapshot.phase).toBe("ENEMY_TURN");
    expect(snapshot.pressTurn.icons).toHaveLength(0);
    snapshot = resolveNextEnemyAction(snapshot);
    expect(get(snapshot, "e").statusEffects).not.toEqual(expect.arrayContaining([expect.objectContaining({ effectId: "freeze" })]));
    expect(get(snapshot, "e").canAct).toBe(true);
  });

  it("mid-phase control skips the partial phase and empty phases still count", () => {
    const p = participant("p", "player", { statusEffects: [{ ...status("freeze"), firstTickPhase: 1 }] });
    expect(expireSidePhase(p, 0, "player").statusEffects).toHaveLength(1);
    const next = finishEnemy(battle([p]));
    expect(next.phase).toBe("ENEMY_TURN");
    expect(next.turnCount).toBe(2);
    expect(get(next, "p").statusEffects).toHaveLength(0);
  });

  it("cleanse restores queued actors without extra icons and keeps down restrictions", () => {
    const p = participant("p", "player");
    const ally = participant("ally", "player", { statusEffects: [status("sleep")] });
    const snapshot = battle([p, ally]);
    snapshot.pressTurnAllocation!.participantIds = ["p"];
    const next = resolveSelectedBattleAction({
      ...snapshot, selectedActionId: "basic-item", selectedContentId: "17", selectedTargetId: "ally",
    });
    expect(get(next, "ally").canAct).toBe(true);
    expect(next.currentActorId).toBe("ally");
    expect(next.pressTurn.icons).toHaveLength(1);
    const down = refreshBattleStatus(battle([participant("p", "player", { isDown: true, hp: { current: 0, max: 1000 } })]));
    expect(get(down, "p").canAct).toBe(false);
  });

  it("caches paralysis once per phase through queries, refresh, JSON resume, and legacy canAct", () => {
    const first = refreshBattleStatus(battle([participant("p", "player", { statusEffects: [status("paralyze")] })]));
    expect(Math.random).toHaveBeenCalledTimes(1);
    const resumed = refreshBattleStatus(JSON.parse(JSON.stringify(first)) as BattleSnapshot);
    expect(resumed).toEqual(first);
    expect(Math.random).toHaveBeenCalledTimes(1);
    const next = refreshBattleStatus({ ...resumed, turnCount: 2 });
    expect(Math.random).toHaveBeenCalledTimes(2);
    expect(get(next, "p").statusEffects![0]!.paralysisPhase).toBe(2);
    const legacy = refreshBattleStatus(battle([participant("p", "player", {
      canAct: false, statusEffects: [status("paralyze")],
    })]));
    expect(get(legacy, "p").statusEffects![0]!.paralysisBlocked).toBe(true);
    expect(Math.random).toHaveBeenCalledTimes(2);
  });

  it("restores legacy status-derived canAct but preserves explicit external restrictions", () => {
    const legacy = refreshBattleStatus(battle([
      participant("p", "player"),
      participant("ally", "player", { canAct: false, statusEffects: [status("sleep")] }),
    ]));
    expect(get(legacy, "ally").canAct).toBe(false);
    const cured = resolveSelectedBattleAction({
      ...legacy, selectedActionId: "basic-item", selectedContentId: "17", selectedTargetId: "ally",
    });
    expect(get(cured, "ally").canAct).toBe(true);
    const external = refreshBattleStatus(battle([
      participant("p", "player"),
      participant("ally", "player", {
        canAct: false, canActBeforeStatus: false,
        statusEffects: [{ ...status("freeze"), firstTickPhase: 0 }],
      }),
    ]));
    const stillRestricted = resolveSelectedBattleAction({
      ...external, selectedActionId: "basic-item", selectedContentId: "17", selectedTargetId: "ally",
    });
    expect(get(stillRestricted, "ally").canAct).toBe(false);
  });

  it("enemy-end shields survive until the end of the next opposing phase", () => {
    let next = enemyCast(battle(), "110", "e");
    next = finishEnemy(next);
    expect(next.phase).toBe("PLAYER_COMMAND");
    expect(get(next, "e").statusEffects).toEqual(expect.arrayContaining([expect.objectContaining({ effectId: "fire_null" })]));
    next = resolveSelectedBattleAction({ ...next, selectedActionId: "guard", selectedContentId: null });
    expect(next.phase).toBe("ENEMY_TURN");
    expect(get(next, "e").statusEffects).toHaveLength(0);
    expect(get(next, "p").statusEffects).toEqual(expect.arrayContaining([expect.objectContaining({ effectId: "guard" })]));
  });
});

describe("immediate and legacy instant death", () => {
  it("102 requires current sleep, resolves immediately, and has no ordinary damage", () => {
    vi.mocked(Math.random).mockReturnValue(0);
    expect(get(cast(battle(), "102"), "e").hp.current).toBe(1000);
    const target = participant("e", "enemy", { statusEffects: [status("sleep")] });
    const snapshot = battle(undefined, [target]);
    const resolution = resolveSelectedBattleActionToResolution({ ...snapshot, selectedActionId: "basic-skill", selectedContentId: "102" });
    expect(resolution.outcomes.filter((outcome) => (outcome.hpDelta ?? 0) < 0)).toHaveLength(0);
    const dead = cast(snapshot, "102");
    expect(get(dead, "e").hp.current).toBe(0);
    expect(get(dead, "e").statusEffects?.some((effect) => effect.effectId === "instant_death")).toBe(false);
    expect(dead.battleResult?.outcome).toBe("victory");
  });

  it("retains hit/proc checks, explicit immunity, Endure once, and no regen revival", () => {
    vi.mocked(Math.random).mockReturnValue(0);
    const immune = participant("e", "enemy", { statusImmunities: ["instant_death"] });
    expect(get(cast(battle(undefined, [immune]), "172"), "e").hp.current).toBe(1000);
    const enduring = participant("e", "enemy", { passiveEffects: content.getSkill("160").passiveEffects });
    const survived = cast(battle(undefined, [enduring]), "172");
    expect(get(survived, "e")).toMatchObject({ hp: { current: 1 }, endureUsed: true, isDown: false });
    expect(get(cast(survived, "172"), "e").hp.current).toBe(0);
    vi.mocked(Math.random).mockReturnValue(0.8);
    expect(get(cast(battle(), "172"), "e").hp.current).toBe(1000);
    const legacy = participant("p", "player", {
      statusEffects: [status("instant_death", 2)], passiveEffects: content.getSkill("158").passiveEffects,
    });
    let next = refreshBattleStatus(battle([legacy]));
    expect(get(next, "p").hp.current).toBe(1000);
    next = finishEnemy(next);
    expect(get(next, "p").statusEffects).toContainEqual(status("instant_death", 1));
    next = finishEnemy(JSON.parse(JSON.stringify(next)) as BattleSnapshot);
    expect(get(next, "p")).toMatchObject({ hp: { current: 0 }, isDown: true });
    expect(next.battleResult?.outcome).toBe("defeat");
  });

  it("enemy immediate death uses the same payload and MP path", () => {
    vi.mocked(Math.random).mockReturnValue(0);
    const next = enemyCast(battle(), "176");
    expect(get(next, "p").hp.current).toBe(0);
    expect(get(next, "e").mp.current).toBe(972);
    expect(next.battleResult?.outcome).toBe("defeat");
  });

  it("pure instant death retains the ailment shield on immunity or failed proc", () => {
    const target = participant("e", "enemy", { statusEffects: [status("ailment_null")], statusImmunities: ["instant_death"] });
    vi.mocked(Math.random).mockReturnValue(0);
    expect(get(cast(battle(undefined, [target]), "172"), "e").statusEffects?.[0]?.effectId).toBe("ailment_null");
    target.statusImmunities = [];
    const blocked = cast(battle(undefined, [target]), "172");
    expect(get(blocked, "e").hp.current).toBe(1000);
    expect(get(blocked, "e").statusEffects).toHaveLength(0);
    vi.mocked(Math.random).mockReturnValue(0.8);
    expect(get(cast(battle(undefined, [target]), "172"), "e").statusEffects?.[0]?.effectId).toBe("ailment_null");
  });
});

describe("action-scoped shields and offensive buffs", () => {
  it.each(["Physical", "Gun"] as const)("reflects the full nominal %s multihit once without reflection recursion", (element) => {
    const actor = participant("p", "player", { statusEffects: [status("physical_reflect"), status("charge")] });
    const target = participant("e", "enemy", { statusEffects: [status("guard")] });
    const input = {
      actorId: "p", actor, targetId: "e", target, skillPower: 80, skillElement: BATTLE_ELEMENTS[element],
      skillAccuracy: 100, statDriver: "attack" as const, skillCategory: "physical" as const, hitCount: 3,
    };
    const nominal = buildAttackOutcomes(input).reduce((sum, outcome) => sum - (outcome.hpDelta ?? 0), 0);
    expect(nominal).toBe(39);
    const reflected = buildAttackOutcomes({
      ...input, skillAccuracy: 0,
      target: { ...target, affinities: { weak: 0, resist: 0, nullify: BATTLE_ELEMENTS[element], reflect: 0, absorb: 0 },
        statusEffects: [...target.statusEffects!, status("physical_reflect"), status("physical_null")] },
    });
    expect(reflected).toHaveLength(2);
    expect(reflected.filter((outcome) => outcome.consumedShieldEffectId)).toHaveLength(1);
    expect(reflected[0]!.consumedShieldEffectId).toBe("physical_reflect");
    expect(reflected[1]).toMatchObject({ finalTargetId: "p", hpDelta: -nominal });
    const resistant = buildAttackOutcomes({
      ...input,
      target: { ...target, affinities: { weak: 0, resist: BATTLE_ELEMENTS[element], nullify: 0, reflect: 0, absorb: 0 },
        statusEffects: [...target.statusEffects!, status("physical_reflect")] },
    });
    expect(resistant[1]!.hpDelta).toBe(-18);
  });

  it("settles actual reflection/absorption HP, consumes one layer, and preserves unmatched buffs", () => {
    const p = participant("p", "player", { statusEffects: [status("charge"), status("physical_reflect")] });
    const e = participant("e", "enemy", { statusEffects: [status("physical_reflect"), status("physical_null")] });
    const next = resolveSelectedBattleAction(battle([p], [e]));
    expect(get(next, "p").hp.current).toBeLessThan(1000);
    expect(get(next, "e").hp.current).toBe(1000);
    expect(get(next, "e").statusEffects?.map((effect) => effect.effectId)).toContain("physical_null");
    expect(get(next, "p").statusEffects?.map((effect) => effect.effectId)).toContain("charge");
    const absorbing = participant("e", "enemy", { hp: { current: 999, max: 1000 }, statusEffects: [status("physical_absorb")] });
    expect(get(resolveSelectedBattleAction(battle([p], [absorbing])), "e").hp.current).toBe(1000);
    absorbing.hp.current = 500;
    expect(get(resolveSelectedBattleAction(battle([p], [absorbing])), "e").hp.current).toBe(526);
  });

  it("blocks the harmful bundle but retains damage, debuffs, and wholly failed protection", () => {
    vi.mocked(Math.random).mockReturnValue(0);
    const shielded = () => participant("e", "enemy", { statusEffects: [status("ailment_null")] });
    const bundled = cast(battle(undefined, [shielded()]), "177");
    expect(get(bundled, "e").hp.current).toBeLessThan(1000);
    expect(get(bundled, "e").statusEffects).toHaveLength(0);
    const debuffed = cast(battle(undefined, [shielded()]), "186");
    expect(get(debuffed, "e").statusEffects).toHaveLength(4);
    const support = cast(battle(undefined, [shielded()]), "189");
    expect(get(support, "e").statusEffects).toHaveLength(0);
    const immune = shielded();
    immune.statusImmunities = ["sleep"];
    expect(get(cast(battle(undefined, [immune]), "189"), "e").statusEffects?.[0]?.effectId).toBe("ailment_null");
    vi.mocked(Math.random).mockReturnValue(0.99);
    expect(get(cast(battle(undefined, [shielded()]), "189"), "e").statusEffects?.[0]?.effectId).toBe("ailment_null");
  });

  it.each(["0", "5", "16", "169"])("charge boosts every effective hit and target of %s and consumes once", (skillId) => {
    const enemies = [participant("e", "enemy"), participant("e2", "enemy")];
    const baseline = cast(battle(undefined, enemies), skillId);
    const charged = cast(battle([participant("p", "player", { statusEffects: [status("charge"), status("chant")] })], enemies), skillId);
    for (const enemy of enemies) expect(1000 - get(charged, enemy.id).hp.current).toBe((1000 - get(baseline, enemy.id).hp.current) * 2);
    expect(get(charged, "p").statusEffects?.map((effect) => effect.effectId)).toEqual(["chant"]);
    const resolution = resolveSelectedBattleActionToResolution({
      ...battle([participant("p", "player", { statusEffects: [status("charge")] })], enemies),
      selectedActionId: "basic-skill", selectedContentId: skillId,
    });
    expect(resolution.outcomes.filter((outcome) => outcome.removedStatusEffectIds?.includes("charge"))).toHaveLength(1);
  });

  it("basic attacks consume charge, misses/blocks retain it, magic retains focus", () => {
    const p = participant("p", "player", { statusEffects: [status("charge"), status("focus"), status("chant")] });
    const attacked = resolveSelectedBattleAction(battle([p]));
    expect(get(attacked, "p").statusEffects?.map((effect) => effect.effectId)).toEqual(["chant"]);
    const magic = cast(battle([p]), "36");
    expect(get(magic, "p").statusEffects?.map((effect) => effect.effectId)).toEqual(["charge", "focus"]);
    const blocked = resolveSelectedBattleAction(battle([p], [participant("e", "enemy", { statusEffects: [status("physical_null")] })]));
    expect(get(blocked, "p").statusEffects?.map((effect) => effect.effectId)).toEqual(["charge", "focus", "chant"]);
    vi.mocked(Math.random).mockReturnValue(0.99);
    expect(get(resolveSelectedBattleAction(battle([p])), "p").statusEffects?.map((effect) => effect.effectId)).toEqual(["charge", "focus", "chant"]);
  });

  it("enemy multihit uses boosts and offensive status riders with ailment protection", () => {
    vi.mocked(Math.random).mockReturnValue(0);
    const p = participant("p", "player", { statusEffects: [status("ailment_null")] });
    const e = participant("e", "enemy", { statusEffects: [status("chant")] });
    const next = enemyCast(battle([p], [e]), "177");
    expect(get(next, "p").hp.current).toBeLessThan(1000);
    expect(get(next, "p").statusEffects).toHaveLength(0);
    expect(get(next, "e").statusEffects).toHaveLength(0);
    const frozen = enemyCast(battle(), "45");
    expect(get(frozen, "p").canAct).toBe(false);
  });

  it("enemy multihit doubles every segment and consumes once after a partial blocked area action", () => {
    const baseline = enemyCast(battle(), "306");
    const boosted = enemyCast(battle(undefined, [
      participant("e", "enemy", { statusEffects: [status("charge")] }),
    ]), "306");
    expect(1000 - get(boosted, "p").hp.current).toBe(2 * (1000 - get(baseline, "p").hp.current));
    expect(get(boosted, "e").statusEffects).toHaveLength(0);
    const partiallyBlocked = cast(battle([
      participant("p", "player", { statusEffects: [status("charge")] }),
    ], [
      participant("e", "enemy", { statusEffects: [status("physical_null")] }),
      participant("e2", "enemy"),
    ]), "16");
    expect(get(partiallyBlocked, "e").hp.current).toBe(1000);
    expect(get(partiallyBlocked, "e2").hp.current).toBeLessThan(1000);
    expect(get(partiallyBlocked, "p").statusEffects).toHaveLength(0);
  });

  it("direct Boss status application shares immunity, protection, eligibility and death settlement", () => {
    let snapshot = battle(undefined, [participant("e", "enemy", { statusEffects: [status("ailment_null")] })]);
    snapshot.bossRuntime = createEmptyBossRuntimeState();
    snapshot = applyBossEffects(snapshot, [
      { type: "apply_status", actorId: "e", effectId: "poison", duration: 3 },
      { type: "apply_status", actorId: "e", effectId: "burn", duration: 3 },
    ]);
    expect(get(snapshot, "e").statusEffects).toHaveLength(0);
    snapshot = applyBossEffects(snapshot, [{ type: "apply_status", actorId: "e", effectId: "freeze", duration: 1 }]);
    expect(get(snapshot, "e").canAct).toBe(false);
    expect(get(snapshot, "e").statusEffects).toContainEqual({ ...status("freeze"), firstTickPhase: 1 });
    get(snapshot, "e").passiveEffects = content.getSkill("160").passiveEffects;
    snapshot = applyBossEffects(snapshot, [{ type: "apply_status", actorId: "e", effectId: "instant_death", duration: 1 }]);
    expect(get(snapshot, "e")).toMatchObject({ hp: { current: 1 }, endureUsed: true });
    expect(get(snapshot, "e").statusEffects?.some((effect) => effect.effectId === "instant_death")).toBe(false);
    const beforeRolls = vi.mocked(Math.random).mock.calls.length;
    snapshot = applyBossEffects(snapshot, [
      { type: "apply_status", actorId: "p", effectId: "paralyze", duration: 3 },
      { type: "apply_status", actorId: "p", effectId: "paralyze", duration: 3 },
    ]);
    expect(vi.mocked(Math.random).mock.calls.length - beforeRolls).toBe(1);
  });

  it("fixed items retain their base/affinity while obeying shield and guard", () => {
    const use = (e: BattleParticipant) => resolveSelectedBattleAction({
      ...battle(undefined, [e]), selectedActionId: "basic-item", selectedContentId: "27",
    });
    const guarded = participant("e", "enemy", { statusEffects: [status("guard")] });
    expect(get(use(guarded), "e").hp.current).toBe(985);
    const reflected = use(participant("e", "enemy", { statusEffects: [status("fire_reflect"), status("guard")] }));
    expect(get(reflected, "p").hp.current).toBe(985);
    expect(get(reflected, "e").hp.current).toBe(1000);
    const untyped = { ...content.getItem("27"), element: undefined };
    vi.spyOn(content, "getItem").mockReturnValue(untyped);
    expect(get(use(participant("e", "enemy", { statusEffects: [status("fire_null"), status("guard")] })), "e").hp.current).toBe(985);
  });
});
