import * as content from "@/content/contentRegistry";
import * as enemyUtility from "@/engine/battle/enemyUtility";
import * as battleLogger from "@/engine/battle/battleLogger";
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

describe("buff dispel support", () => {
  const cases = [
    ["player", "175"], ["player", "187"], ["enemy", "175"], ["enemy", "187"],
  ] as const;

  it.each(cases)("%s skill %s removes every buff stack from living active opponents, retaining shields and unrelated state", (side, skillId) => {
    const opposite = side === "player" ? "enemy" : "player";
    const casterId = side === "player" ? "p" : "e";
    const targetId = side === "player" ? "e" : "p";
    const buffs = [...content.getStatusEffectMap().values()].filter((effect) => effect.type === "buff");
    const shields = [...content.getStatusEffectMap().values()].filter((effect) => effect.type === "shield");
    const target = participant(targetId, opposite, {
      statusEffects: [
        ...buffs.map((effect) => ({ ...status(effect.id), stacks: effect.stackable ? 2 : 1 })),
        ...shields.map((effect) => status(effect.id)),
        status("attack_down"), status("burn"), status("blind"), status("unknown", 3),
      ],
      passiveEffects: content.getSkill("160").passiveEffects, accessoryEffects: ["auto_buff_start"],
      affinities: { weak: 0, resist: 0, nullify: BATTLE_ELEMENTS.Dark | BATTLE_ELEMENTS.Ailment, reflect: 0, absorb: 0 },
    });
    const targets = [target, { ...target, id: "second" }, { ...target, id: "inactive", isActive: false },
      { ...target, id: "down", isDown: true, hp: { current: 0, max: 1000 } }];
    const casters = [participant(casterId, side, { statusEffects: [status("blind"), status("attack_up")] }),
      participant("friend", side, { statusEffects: [status("attack_up")] })];
    const snapshot = refreshBattleStatus(side === "player" ? battle(casters, targets) : battle(targets, casters));
    vi.mocked(Math.random).mockReturnValue(0.99);
    const next = side === "player" ? cast(snapshot, skillId, targetId) : enemyCast(snapshot, skillId, targetId);
    for (const id of [targetId, "second"]) {
      const before = get(snapshot, id);
      const after = get(next, id);
      const expected = before.statusEffects!.filter((effect) => !buffs.some((buff) => buff.id === effect.effectId));
      if (skillId === "175") {
        expected[expected.findIndex((effect) => effect.effectId === "attack_down")] = { ...status("attack_down"), stacks: 2 };
        expected.push(status("defense_down"), status("agility_down"));
      }
      expect(after.statusEffects).toEqual(expected);
      for (const key of ["hp", "mp", "attack", "defense", "agility", "intelligence", "passiveEffects", "accessoryEffects", "affinities"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
    }
    for (const id of ["inactive", "down", "friend", casterId]) {
      expect(get(next, id).statusEffects).toEqual(get(snapshot, id).statusEffects);
    }
    expect(get(next, casterId).mp.current).toBe(1000 - content.getSkill(skillId).mpCost);
    expect(next.pressTurn.icons).toHaveLength(1);
    expect(next.pressTurn.icons[0]!.state).toBe("solid");
    expect(next.pressTurn.ownerSide).toBe(side);
    expect(next.battleLog?.filter((entry) => entry.kind === "action")).toHaveLength(1);
  });

  it.each(cases)("%s skill %s still pays once and spends an action when no buff matches", (side, skillId) => {
    const snapshot = battle();
    const next = side === "player" ? cast(snapshot, skillId) : enemyCast(snapshot, skillId);
    expect(get(next, side === "player" ? "p" : "e").mp.current).toBe(1000 - content.getSkill(skillId).mpCost);
    expect(next.pressTurn.icons).toHaveLength(1);
    expect(next.pressTurn.ownerSide).toBe(side);
    expect(get(next, side === "player" ? "e" : "p").statusEffects?.map((effect) => effect.effectId)).toEqual(
      skillId === "175" ? ["attack_down", "defense_down", "agility_down"] : [],
    );
  });
});

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
      skillPower: skill.power, skillElement: skill.element, skillAccuracy: 199,
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

describe("charged affinity/shield piercing and numeric guaranteed attacks", () => {
  const fire = BATTLE_ELEMENTS.Fire;
  const affinities = { weak: 0, resist: fire, nullify: 0, reflect: 0, absorb: 0 };

  function attack(side: "player" | "enemy", skillId: string, target: Partial<BattleParticipant>, charged = true) {
    const casterId = side === "player" ? "p" : "e";
    const targetId = side === "player" ? "e" : "p";
    const snapshot = battle();
    Object.assign(get(snapshot, casterId), { statusEffects: charged ? [status("charge")] : [] });
    Object.assign(get(snapshot, targetId), target);
    return side === "player" ? cast(snapshot, skillId) : enemyCast(snapshot, skillId);
  }

  it.each(["player", "enemy"] as const)("%s charged 164 ignores native/passive Fire resistance without mutating it", (side) => {
    const targetId = side === "player" ? "e" : "p";
    const casterId = side === "player" ? "p" : "e";
    const neutral = attack(side, "164", {});
    const resistant = attack(side, "164", { affinities });
    const passive = attack(side, "164", { passiveEffects: [{ hook: "on_damage_calc", type: "element_resist", element: "Fire", value: 0.5 }] });
    expect(get(neutral, targetId).hp.current).toBeLessThan(1000);
    expect(get(resistant, targetId).hp).toEqual(get(neutral, targetId).hp);
    expect(get(passive, targetId).hp).toEqual(get(neutral, targetId).hp);
    expect(get(resistant, targetId).affinities).toEqual(affinities);
    expect(get(passive, targetId).passiveEffects).toHaveLength(1);
    expect(get(resistant, casterId).statusEffects).not.toEqual(expect.arrayContaining([expect.objectContaining({ effectId: "charge" })]));
    expect(get(resistant, casterId).mp.current).toBe(955);
    expect(get(attack(side, "164", { affinities }, false), targetId).hp.current)
      .toBeGreaterThan(get(attack(side, "164", {}, false), targetId).hp.current);
    expect(get(attack(side, "0", { affinities: { ...affinities, resist: BATTLE_ELEMENTS.Physical } }), targetId).hp.current)
      .toBeGreaterThan(get(attack(side, "0", {}), targetId).hp.current);
  });

  it.each(["player", "enemy"] as const)("%s charged 164 bypasses native/passive prevention and every matching shield without consuming it", (side) => {
    const targetId = side === "player" ? "e" : "p";
    const casterId = side === "player" ? "p" : "e";
    const playerLog = vi.spyOn(battleLogger, "createPlayerActionLogEntry");
    const enemyLog = vi.spyOn(battleLogger, "createEnemySkillLogEntry");
    const neutralDamage = 1000 - get(attack(side, "164", {}), targetId).hp.current;
    const protections: Partial<BattleParticipant>[] = [
      ...["nullify", "reflect", "absorb"].map((prevention) => ({
        affinities: { ...affinities, [prevention]: fire | BATTLE_ELEMENTS.Ice },
      })),
      { passiveEffects: [{ hook: "on_damage_calc", type: "element_nullify", element: "Fire", value: 1 }] },
      ...["fire_null", "fire_reflect", "fire_absorb", "element_null"].map((effectId) => ({ statusEffects: [status(effectId)] })),
      {
        affinities: { ...affinities, nullify: fire, reflect: fire, absorb: fire },
        statusEffects: ["fire_null", "fire_reflect", "fire_absorb", "element_null", "physical_null"].map((id) => status(id)),
      },
    ];
    for (const protection of protections) {
      const result = attack(side, "164", { ...protection, hp: { current: 500, max: 1000 } });
      expect(get(result, targetId).hp.current).toBe(500 - neutralDamage);
      expect(get(result, casterId).hp.current).toBe(1000);
      expect(get(result, casterId).mp.current).toBe(955);
      expect(get(result, casterId).statusEffects).not.toContainEqual(expect.objectContaining({ effectId: "charge" }));
      expect(get(result, targetId).affinities).toEqual(protection.affinities);
      expect(get(result, targetId).passiveEffects).toEqual(protection.passiveEffects);
      expect(get(result, targetId).statusEffects).toMatchObject(protection.statusEffects ?? []);
      expect(result.pressTurn.ownerSide).toBe(side);
      expect(result.pressTurn.icons).toHaveLength(1);
      expect(result.pressTurn.icons[0]!.state).toBe("solid");
      const outcomes = side === "player" ? playerLog.mock.calls.at(-1)![0].outcomes : enemyLog.mock.calls.at(-1)![4];
      expect(outcomes.filter((outcome) => outcome.finalTargetId === targetId)).toEqual([
        { actorId: casterId, primaryTargetId: targetId, finalTargetId: targetId, type: "hit", tags: [], hpDelta: -neutralDamage },
      ]);
      expect(outcomes.every((outcome) => outcome.preventedBy == null && outcome.consumedShieldEffectId == null)).toBe(true);
      if (protection.statusEffects?.length === 1) {
        const ordinary = side === "player" ? cast(result, "164") : enemyCast(result, "164");
        expect(get(ordinary, targetId).hp.current).toBeGreaterThanOrEqual(get(result, targetId).hp.current);
        const laterOutcomes = side === "player" ? playerLog.mock.calls.at(-1)![0].outcomes : enemyLog.mock.calls.at(-1)![4];
        expect(laterOutcomes).toContainEqual(expect.objectContaining({ consumedShieldEffectId: protection.statusEffects[0]!.effectId }));
      }
    }
  });

  it.each(["player", "enemy"] as const)("%s piercing retains guard, weakness and charge on a miss", (side) => {
    const targetId = side === "player" ? "e" : "p";
    const casterId = side === "player" ? "p" : "e";
    const neutralDamage = 1000 - get(attack(side, "164", {}), targetId).hp.current;
    const guarded = attack(side, "164", { affinities: { ...affinities, nullify: fire }, statusEffects: [status("fire_reflect"), status("guard")] });
    expect(1000 - get(guarded, targetId).hp.current).toBe(Math.floor(neutralDamage * 0.5));
    const weak = attack(side, "164", { affinities: { ...affinities, nullify: fire, weak: fire }, statusEffects: [status("element_null")] });
    expect(1000 - get(weak, targetId).hp.current).toBeGreaterThan(neutralDamage);
    expect(weak.battleLog?.some((entry) => entry.summary.includes("弱点"))).toBe(true);
    expect(weak.pressTurn.icons).toHaveLength(2);
    expect(weak.pressTurn.icons.some((icon) => icon.state === "blinking")).toBe(true);
    const guardedWeak = attack(side, "164", { affinities: { ...affinities, nullify: fire, weak: fire }, statusEffects: [status("fire_null"), status("guard")] });
    expect(1000 - get(guardedWeak, targetId).hp.current).toBe(Math.floor(neutralDamage * 0.5));
    expect(guardedWeak.battleLog?.some((entry) => entry.summary.includes("弱点"))).toBe(false);
    vi.mocked(Math.random).mockReturnValue(0.9999999999999999);
    const missed = attack(side, "164", { affinities: { ...affinities, reflect: fire }, statusEffects: [status("fire_reflect")] });
    expect(get(missed, targetId).hp.current).toBe(1000);
    expect(get(missed, casterId).hp.current).toBe(1000);
    expect(get(missed, casterId).statusEffects).toContainEqual(expect.objectContaining({ effectId: "charge" }));
    expect(get(missed, targetId).statusEffects).toContainEqual(expect.objectContaining({ effectId: "fire_reflect" }));
    expect(get(missed, casterId).mp.current).toBe(955);
    expect(missed.battleLog?.some((entry) => entry.summary.includes("未命中"))).toBe(true);
  });

  it.each(["player", "enemy"] as const)("%s uncharged 164 and unrelated charged skills still obey prevention", (side) => {
    const targetId = side === "player" ? "e" : "p";
    const casterId = side === "player" ? "p" : "e";
    for (const [skillId, charged] of [["164", false], ["162", true]] as const) {
      for (const prevention of ["nullify", "reflect", "absorb"] as const) {
        const result = attack(side, skillId, { affinities: { ...affinities, [prevention]: fire } }, charged);
        expect(get(result, targetId).hp.current).toBe(1000);
        if (charged) expect(get(result, casterId).statusEffects).toContainEqual(expect.objectContaining({ effectId: "charge" }));
      }
      const passive = attack(side, skillId, { passiveEffects: [{ hook: "on_damage_calc", type: "element_nullify", element: "Fire", value: 1 }] }, charged);
      expect(get(passive, targetId).hp.current).toBe(1000);
      for (const effectId of ["fire_null", "fire_reflect", "fire_absorb", "element_null"]) {
        const result = attack(side, skillId, { affinities, statusEffects: [status(effectId)] }, charged);
        expect(get(result, targetId).hp.current).toBe(1000);
        expect(get(result, targetId).statusEffects).not.toContainEqual(expect.objectContaining({ effectId }));
        if (charged) expect(get(result, casterId).statusEffects).toContainEqual(expect.objectContaining({ effectId: "charge" }));
        if (effectId === "fire_reflect") expect(get(result, casterId).hp.current).toBeLessThan(1000);
      }
    }
  });

  it.each(["player", "enemy"] as const)("%s real guaranteed skills hit through blind/extreme agility without guaranteeing their riders", (side) => {
    vi.mocked(Math.random).mockReturnValue(0.9999999999999999);
    for (const skillId of ["42", "49", "56", "63", "70", "77", "84", "170"]) {
      const casterId = side === "player" ? "p" : "e";
      const targetId = side === "player" ? "e" : "p";
      const snapshot = battle();
      Object.assign(get(snapshot, casterId), { agility: 0, statusEffects: [status("blind")] });
      get(snapshot, targetId).agility = 1000000;
      const next = side === "player" ? cast(snapshot, skillId) : enemyCast(snapshot, skillId);
      expect(get(next, targetId).hp.current, skillId).toBeLessThan(1000);
      expect(get(next, targetId).statusEffects, skillId).toEqual([]);
      expect(get(next, casterId).mp.current, skillId).toBe(1000 - content.getSkill(skillId).mpCost);
    }
  });

  it.each(["player", "enemy"] as const)("%s guaranteed accuracy still respects native prevention and temporary shields", (side) => {
    vi.mocked(Math.random).mockReturnValue(0.9999999999999999);
    const targetId = side === "player" ? "e" : "p";
    for (const prevention of ["nullify", "reflect", "absorb"] as const) {
      expect(get(attack(side, "42", { affinities: { ...affinities, [prevention]: fire } }), targetId).hp.current).toBe(1000);
    }
    expect(get(attack(side, "42", { statusEffects: [status("fire_null")] }), targetId).hp.current).toBe(1000);
  });
});
