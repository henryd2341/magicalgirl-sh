import { getSkill } from "@/content/contentRegistry";
import type { BossProfile } from "@/engine/battle/boss/bossRegistry";
import type { BossActionIntent, BossContext, BossEffect, BossUtilityCandidate } from "@/engine/battle/boss/bossTypes";

interface EchoArchive { element?: number; actionCategory?: string; favoredParticipantId?: string; remainingRounds: number }
interface PendingEcho { elements: number[]; categories: string[]; targets: string[] }
function hunter(context: BossContext) { return context.snapshot.participants.find((participant) => participant.enemyId === "105"); }
function pending(context: BossContext): PendingEcho { return structuredClone((context.runtime.mechanicState["echo:pending"] as PendingEcho | undefined) ?? { elements: [], categories: [], targets: [] }); }
function mostFrequent<T>(values: T[]): T | undefined { let best: T | undefined; let bestCount = 0; for (const value of values) { const count = values.filter((candidate) => candidate === value).length; if (count > bestCount) { best = value; bestCount = count; } } return best; }
function category(actionId: string): string {
  if (actionId === "guard" || actionId === "pass") return actionId;
  try { const value = getSkill(actionId).category; return value === "physical" || value === "magic" ? "attack" : value === "heal" ? "heal" : "buff"; } catch { return "attack"; }
}
function player(context: BossContext, id: string) { return context.snapshot.participants.some((participant) => participant.id === id && participant.side === "player"); }
function intent(context: BossContext, skillId: string, targetId?: string): BossActionIntent | null { const actor = hunter(context); if (actor == null) return null; const targets = targetId == null ? context.snapshot.participants.filter((p) => p.side === "player" && p.isActive && !p.isDown).map((p) => p.id) : [targetId]; return { type: "use_skill", actorId: actor.id, skillId, targetIds: skillId === "285" || skillId === "286" || skillId === "292" ? targets.slice(0, 1) : targets, reason: "回声档案反制" }; }
export const echoHunterProfile: BossProfile = {
  id: "echo-hunter", actorEnemyIds: ["105"], initialPhase: "single", skillIds: Array.from({ length: 10 }, (_, index) => String(284 + index)),
  reduceEvent(context, event): BossEffect[] {
    const actor = hunter(context); const effects: BossEffect[] = [];
    if (event.type === "damage_applied") {
      if (player(context, event.sourceId)) { const next = pending(context); next.elements.push(event.element); next.targets.push(event.sourceId); effects.push({ type: "set_mechanic_state", key: "echo:pending", value: next }); }
      if (actor?.id === event.targetId) { const ratio = actor.hp.current / actor.hp.max; const phase = context.runtime.phaseByActorId[actor.id]; if (ratio <= 0.4 && phase !== "archive") effects.push({ type: "set_phase", actorId: actor.id, phase: "archive" }, { type: "append_mechanic_log", summary: "万声归猎", details: ["保留最近两轮完整档案"] }); else if (ratio <= 0.7 && phase === "single") effects.push({ type: "set_phase", actorId: actor.id, phase: "dual" }, { type: "append_mechanic_log", summary: "回声维度扩展", details: ["同时记录属性与行动类别"] }); }
      return effects;
    }
    if (event.type === "action_resolved" && player(context, event.actorId)) { const next = pending(context); next.categories.push(category(event.actionId)); next.targets.push(...event.targetIds.filter((id) => player(context, id))); return [{ type: "set_mechanic_state", key: "echo:pending", value: next }]; }
    if (event.type === "round_ended") {
      const phase = actor == null ? "single" : context.runtime.phaseByActorId[actor.id]; const data = pending(context);
      const archive: EchoArchive = { remainingRounds: phase === "archive" ? 2 : 1 };
      archive.element = mostFrequent(data.elements);
      if (phase !== "single") archive.actionCategory = mostFrequent(data.categories);
      if (phase === "archive") archive.favoredParticipantId = mostFrequent(data.targets);
      const previous = ((context.runtime.mechanicState["echo:archives"] as EchoArchive[] | undefined) ?? []).map((entry) => ({ ...entry, remainingRounds: entry.remainingRounds - 1 })).filter((entry) => entry.remainingRounds > 0);
      const archives = [...previous, archive].slice(phase === "archive" ? -2 : -1);
      return [
        { type: "set_mechanic_state", key: "echo:archives", value: archives },
        { type: "set_mechanic_state", key: "echo:pending", value: { elements: [], categories: [], targets: [] } },
        { type: "append_mechanic_log", summary: "回声档案已公开", details: [`属性 ${archive.element ?? "无"}`, `行动 ${archive.actionCategory ?? "未启用"}`, `角色 ${archive.favoredParticipantId ?? "未启用"}`] },
      ];
    }
    return [];
  },
  selectForcedIntent() { return null; },
  enumerateUtilityCandidates(context): BossUtilityCandidate[] {
    const archive = ((context.runtime.mechanicState["echo:archives"] as EchoArchive[] | undefined) ?? []).at(-1); if (archive == null) return [];
    const definitions: Array<[string, string | undefined, number]> = [];
    if (archive.element != null) definitions.push(["285", undefined, 9]);
    const categorySkill: Record<string, string> = { attack: "286", heal: "287", buff: "288", debuff: "289", guard: "290", pass: "290" };
    if (archive.actionCategory != null) definitions.push([categorySkill[archive.actionCategory] ?? "286", undefined, 8]);
    if (archive.favoredParticipantId != null) definitions.push(["292", archive.favoredParticipantId, 10]);
    return definitions.map(([skillId, targetId, score], stableOrder) => ({ intent: intent(context, skillId, targetId)!, available: true, score, noise: 0.1, stableOrder }));
  },
};
