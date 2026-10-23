import { getStatusEffectMap } from "@/content/contentRegistry";
import { cloneBossStateValue } from "@/engine/battle/boss/bossStateClone";
import { isShieldStatusEffect } from "@/engine/battle/statusEffectEngine";
import type { BossProfile } from "@/engine/battle/boss/bossRegistry";
import type { BossActionIntent, BossContext, BossEffect, BossUtilityCandidate, HiddenExecutionFailure } from "@/engine/battle/boss/bossTypes";
import { BATTLE_ELEMENTS } from "@/types/battle";

export const ALL_HIDDEN_DAMAGE_RESISTANCE = BATTLE_ELEMENTS.Physical | BATTLE_ELEMENTS.Gun | BATTLE_ELEMENTS.Fire | BATTLE_ELEMENTS.Ice | BATTLE_ELEMENTS.Electric | BATTLE_ELEMENTS.Wind | BATTLE_ELEMENTS.Earth | BATTLE_ELEMENTS.Light | BATTLE_ELEMENTS.Dark | BATTLE_ELEMENTS.Almighty;
export function effectiveHiddenAilmentChance(baseChance: number, priorSuccesses: number): number { return Math.max(5, baseChance - 25 * priorSuccesses); }
export interface HiddenPairState { phase: "trial" | "confluence" | "horizon"; confluenceRounds: number; bigWindowStartRound: number; bigWindowDamage: number; smallWindow: { remainingPlayerRounds: number; damage: number } | null; crisisEntered: Record<"107" | "108", boolean>; finalPlayerRoundsRemaining: number | null; reviveTargetActorId: string | null; ailmentSuccesses: Record<string, Record<string, number>>; }
interface CommandmentState { skillUses: Record<string, number>; guardOrPassActors: string[]; partyHealing: number; }
const INITIAL: HiddenPairState = { phase: "trial", confluenceRounds: 0, bigWindowStartRound: 1, bigWindowDamage: 0, smallWindow: null, crisisEntered: { "107": false, "108": false }, finalPlayerRoundsRemaining: null, reviveTargetActorId: null, ailmentSuccesses: {} };
const EMPTY_COMMANDMENTS: CommandmentState = { skillUses: {}, guardOrPassActors: [], partyHealing: 0 };
const EXECUTION_FLAGS: Record<HiddenExecutionFailure, string> = {
  shield_commandment: "hidden:shieldCommandmentFailed",
  big_dps: "hidden:bigDpsFailed",
  final_countdown: "hidden:finalFailed",
};
function pair(context: BossContext): HiddenPairState { return cloneBossStateValue((context.runtime.mechanicState["hidden:pair"] as HiddenPairState | undefined) ?? INITIAL); }
function commandments(context: BossContext): CommandmentState { return cloneBossStateValue((context.runtime.mechanicState["hidden:commandments"] as CommandmentState | undefined) ?? EMPTY_COMMANDMENTS); }
function bosses(context: BossContext) { return context.snapshot.participants.filter((p) => p.enemyId === "107" || p.enemyId === "108"); }
function bossByEnemy(context: BossContext, enemyId: "107" | "108") { return bosses(context).find((p) => p.enemyId === enemyId); }
function livingPlayerObjects(context: BossContext) { return context.snapshot.participants.filter((p) => p.side === "player" && p.isActive && !p.isDown); }
function isPlayer(context: BossContext, id: string) { return context.snapshot.participants.some((p) => p.id === id && p.side === "player"); }
function stateEffect(value: HiddenPairState): BossEffect { return { type: "set_mechanic_state", key: "hidden:pair", value }; }
function commandEffect(value: CommandmentState): BossEffect { return { type: "set_mechanic_state", key: "hidden:commandments", value }; }
function sharedRatio(context: BossContext) { const values = bosses(context); return values.reduce((n, p) => n + p.hp.current, 0) / values.reduce((n, p) => n + p.hp.max, 0); }
function queueIfEmpty(context: BossContext, actorId: string | undefined, skillId: string, summary: string): BossEffect[] { return actorId != null && context.runtime.queuedCounters[actorId] == null ? [{ type: "enqueue_counter", actorId, skillId }, { type: "append_mechanic_log", summary, details: [`反击 ${skillId} 已登记`] }] : []; }
function positiveStageSum(context: BossContext, targetId: string): number { const target = context.snapshot.participants.find((p) => p.id === targetId); const map = getStatusEffectMap(); return (target?.statusEffects ?? []).reduce((sum, status) => { const modifiers = map.get(status.effectId)?.statModifiers ?? {}; const positive = Object.values(modifiers).filter((value) => (value ?? 0) > 0).reduce((n, value) => n + (value ?? 0), 0); return sum + positive * status.stacks; }, 0); }
function useSkill(actorId: string, skillId: string, targetIds: string[], reason: string): BossActionIntent { return { type: "use_skill", actorId, skillId, targetIds, reason }; }

export const hiddenMagicalGirlsProfile: BossProfile = {
  id: "hidden-magical-girls", actorEnemyIds: ["107", "108"], initialPhase: "trial", skillIds: Array.from({ length: 24 }, (_, i) => String(306 + i)),
  reduceEvent(context, event): BossEffect[] {
    if (event.type === "hidden_execution_resolved") return [
      { type: "set_flag", key: EXECUTION_FLAGS[event.failure], value: false },
    ];
    const value = pair(context); const effects: BossEffect[] = [];
    if (event.type === "damage_applied" && bosses(context).some((boss) => boss.id === event.targetId)) {
      if (isPlayer(context, event.sourceId)) { value.bigWindowDamage += event.amount; if (value.smallWindow) value.smallWindow.damage += event.amount; }
      const ratio = sharedRatio(context);
      if (value.phase === "trial" && ratio <= 0.7) { value.phase = "confluence"; value.confluenceRounds = 0; value.smallWindow = { remainingPlayerRounds: 2, damage: 0 }; effects.push(...bosses(context).map((boss) => ({ type: "set_phase", actorId: boss.id, phase: "confluence" } as BossEffect)), { type: "append_mechanic_log", summary: "天地交灼", details: ["小型 DPS 检定：2 回合 / 800 伤害"] }); }
      else if (value.phase !== "horizon" && ratio <= 0.35) { value.phase = "horizon"; value.smallWindow = null; effects.push(...bosses(context).map((boss) => ({ type: "set_phase", actorId: boss.id, phase: "horizon" } as BossEffect)), { type: "append_mechanic_log", summary: "终末地平", details: ["危急状态与最终倒计时已启用"] }); }
      if (value.phase === "horizon") for (const boss of bosses(context)) if ((boss.enemyId === "107" || boss.enemyId === "108") && boss.hp.current / boss.hp.max <= 0.2) value.crisisEntered[boss.enemyId] = true;
      if (value.phase === "horizon" && value.crisisEntered["107"] && value.crisisEntered["108"] && value.finalPlayerRoundsRemaining == null) { value.finalPlayerRoundsRemaining = 6; effects.push({ type: "append_mechanic_log", summary: "终景倒计时启动", details: ["剩余 6 个玩家回合"] }); }
      effects.unshift(stateEffect(value)); return effects;
    }
    if (event.type === "action_resolved" && isPlayer(context, event.actorId)) {
      const tracked = commandments(context); tracked.skillUses[event.actionId] = (tracked.skillUses[event.actionId] ?? 0) + 1;
      if ((event.actionId === "guard" || event.actionId === "pass") && !tracked.guardOrPassActors.includes(event.actorId)) tracked.guardOrPassActors.push(event.actorId);
      effects.push(commandEffect(tracked)); const sun = bossByEnemy(context, "107");
      if (tracked.skillUses[event.actionId] >= 3) effects.push(...queueIfEmpty(context, sun?.id, "312", "复燃之戒触发"));
      else if (tracked.guardOrPassActors.length >= 2) effects.push(...queueIfEmpty(context, sun?.id, "313", "退缩之戒触发"));
      return effects;
    }
    if (event.type === "healing_applied" && isPlayer(context, event.targetId)) {
      const tracked = commandments(context); tracked.partyHealing += event.amount; effects.push(commandEffect(tracked));
      const partyMax = livingPlayerObjects(context).reduce((sum, player) => sum + player.hp.max, 0); if (tracked.partyHealing > partyMax * 0.3) effects.push(...queueIfEmpty(context, bossByEnemy(context, "108")?.id, "326", "泛滥之戒触发")); return effects;
    }
    if (event.type === "status_applied") {
      const target = context.snapshot.participants.find((p) => p.id === event.targetId);
      if (target?.side === "player" && isPlayer(context, event.sourceId) && isShieldStatusEffect(event.effectId)) {
        return [
          { type: "set_flag", key: "hidden:shieldCommandmentFailed", value: true },
          { type: "append_mechanic_log", summary: "镜壁戒律触发", details: ["下一次敌方行动将执行万能处决"] },
        ];
      }
      if (target?.side === "player" && positiveStageSum(context, target.id) >= 6) return queueIfEmpty(context, bossByEnemy(context, "108")?.id, "325", "盈满之戒触发");
      if (target?.enemyId === "107" || target?.enemyId === "108") { value.ailmentSuccesses[target.id] ??= {}; value.ailmentSuccesses[target.id]![event.effectId] = (value.ailmentSuccesses[target.id]![event.effectId] ?? 0) + 1; return [stateEffect(value), { type: "increment_ailment_resistance", actorId: target.id, effectId: event.effectId }]; }
    }
    if (event.type === "round_ended") {
      if (event.turnCount % 8 === 0) { const failed = value.bigWindowDamage < 2000; effects.push({ type: "set_flag", key: "hidden:bigDpsFailed", value: failed }, { type: "append_mechanic_log", summary: failed ? "大 DPS 检定失败" : "大 DPS 检定通过", details: [`${value.bigWindowDamage} / 2000`] }); value.bigWindowStartRound = event.turnCount + 1; value.bigWindowDamage = 0; }
      if (value.smallWindow) { value.smallWindow.remainingPlayerRounds -= 1; if (value.smallWindow.remainingPlayerRounds <= 0) { const failed = value.smallWindow.damage < 800; effects.push({ type: "set_flag", key: "hidden:smallDpsFailed", value: failed }, { type: "append_mechanic_log", summary: failed ? "小 DPS 检定失败" : "小 DPS 检定通过", details: [`${value.smallWindow.damage} / 800`] }); if (failed) for (const boss of bosses(context)) effects.push({ type: "adjust_hp", actorId: boss.id, amount: Math.ceil(boss.hp.max * 0.1) }, { type: "apply_status", actorId: boss.id, effectId: "attack_up", duration: 3 }, { type: "apply_status", actorId: boss.id, effectId: "intelligence_up", duration: 3 }); else { const earth = bossByEnemy(context, "108"); if (earth) effects.push({ type: "apply_status", actorId: earth.id, effectId: "defense_down", duration: 1 }); } value.smallWindow = null; } }
      if (value.phase === "confluence") { value.confluenceRounds += 1; if (value.smallWindow == null && value.confluenceRounds % 4 === 0) { value.smallWindow = { remainingPlayerRounds: 2, damage: 0 }; effects.push({ type: "append_mechanic_log", summary: "小 DPS 检定再次启动", details: ["2 回合 / 800 伤害"] }); } }
      if (value.finalPlayerRoundsRemaining != null && value.finalPlayerRoundsRemaining > 0) { value.finalPlayerRoundsRemaining -= 1; if (value.finalPlayerRoundsRemaining === 0) effects.push({ type: "set_flag", key: "hidden:finalFailed", value: true }); }
      effects.unshift(stateEffect(value), commandEffect(EMPTY_COMMANDMENTS)); return effects;
    }
    if (event.type === "participant_down" && bosses(context).some((boss) => boss.id === event.participantId)) { const members = bosses(context); const living = members.filter((p) => !p.isDown); const down = members.filter((p) => p.isDown); value.reviveTargetActorId = down.length === 1 && living.length === 1 ? down[0]!.id : null; return [stateEffect(value), { type: "append_mechanic_log", summary: value.reviveTargetActorId ? "复苏脉动已排入下一实际行动" : "双重击破成立", details: value.reviveTargetActorId ? [`目标 ${value.reviveTargetActorId}`] : [] }]; }
    if (event.type === "action_resolved" && event.actionId === "324" && value.reviveTargetActorId) { const target = value.reviveTargetActorId; value.reviveTargetActorId = null; return [{ type: "revive_actor", actorId: target, hpPercent: 50 }, stateEffect(value), { type: "append_mechanic_log", summary: "复苏脉动", details: ["同伴恢复 50% 最大生命"] }]; }
    return [];
  },
  selectPriorityIntent(context, priority) {
    const value = pair(context); const actor = context.snapshot.participants.find((p) => p.id === context.actorId);
    if (priority === "hard_defeat") {
      for (const failure of ["shield_commandment", "big_dps", "final_countdown"] as const) {
        if (context.runtime.flags[EXECUTION_FLAGS[failure]]) return {
          type: "execute_players", failure, skillId: failure === "final_countdown" ? "316" : "317",
          reason: failure === "shield_commandment" ? "镜壁戒律：玩家方使用护盾" : "隐藏挑战硬性检定失败",
        };
      }
    }
    if (priority === "revival" && value.reviveTargetActorId && actor && !actor.isDown) return useSkill(actor.id, "324", [value.reviveTargetActorId], "强制复活优先");
    if (priority === "emergency" && actor?.enemyId === "108") { const wounded = bosses(context).filter((boss) => !boss.isDown).sort((a, b) => a.hp.current / a.hp.max - b.hp.current / b.hp.max)[0]; if (wounded && wounded.hp.current / wounded.hp.max < 0.5) return useSkill(actor.id, "321", [wounded.id], "大地恩泽紧急恢复"); if (bosses(context).some((boss) => (boss.statusEffects ?? []).length > 0)) return useSkill(actor.id, "322", bosses(context).map((boss) => boss.id), "岩庭净化"); }
    return null;
  },
  selectForcedIntent(context) { const actor = context.snapshot.participants.find((p) => p.id === context.actorId); const value = pair(context); if (actor?.enemyId === "107" && value.crisisEntered["107"]) return useSkill(actor.id, "315", [actor.id], "阳炎危急状态"); if (actor?.enemyId === "108" && value.crisisEntered["108"]) return useSkill(actor.id, "329", [actor.id], "大地危急状态"); return null; },
  enumerateUtilityCandidates(context): BossUtilityCandidate[] {
    const actor = context.snapshot.participants.find((p) => p.id === context.actorId); if (!actor) return [];
    const players = livingPlayerObjects(context); const lowOrDebuffed = [...players].sort((a, b) => Number((b.statusEffects ?? []).length > 0) - Number((a.statusEffects ?? []).length > 0) || a.hp.current / a.hp.max - b.hp.current / b.hp.max)[0]; const value = pair(context);
    const definitions: Array<[string, string[], number]> = actor.enemyId === "107" ? [["306", lowOrDebuffed ? [lowOrDebuffed.id] : [], 8], ["307", players.map((p) => p.id), 7], ["308", lowOrDebuffed ? [lowOrDebuffed.id] : [], 9]] : [["318", lowOrDebuffed ? [lowOrDebuffed.id] : [], 6], ["319", players.map((p) => p.id), 7], ["320", bosses(context).map((boss) => boss.id), 8]];
    if (value.phase !== "trial") definitions.push(["316", players.map((p) => p.id), 10]);
    return definitions.map(([skillId, targetIds, score], stableOrder) => ({ intent: useSkill(actor.id, skillId, targetIds, "隐藏 Boss 职责效用"), available: targetIds.length > 0, score, noise: 0.1, stableOrder }));
  },
};
