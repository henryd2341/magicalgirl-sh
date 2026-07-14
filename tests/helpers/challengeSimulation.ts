import { getSkill } from "@/content/contentRegistry";
import { resolveEnemyTurn, resolveSelectedBattleAction } from "@/engine/battle/battleResolver";
import { createBattleSnapshotFromPendingBattle, createEnemyBattleParticipant, createPendingBattleSnapshot } from "@/engine/battle/battleSetup";
import { registerChallengeBossProfiles } from "@/engine/battle/boss/profiles/registerChallengeBossProfiles";
import type { BattleParticipant, BattleSnapshot } from "@/types/battle";

export type ChallengePolicy = "burst" | "balanced" | "control" | "sustain";

export interface ChallengeSimulationResult {
  outcome: "victory" | "defeat" | "timeout";
  turns: number;
  snapshot: BattleSnapshot;
  invariantErrors: string[];
}

const ENCOUNTERS: Record<string, string[]> = {
  "challenge-1": ["100"],
  "challenge-2": ["101", "102", "103"],
  "challenge-3": ["104"],
  "challenge-4": ["105"],
  "challenge-5": ["106"],
  "challenge-hidden": ["107", "108"],
};

const LEVELS: Record<string, number> = {
  "challenge-1": 24,
  "challenge-2": 40,
  "challenge-3": 58,
  "challenge-4": 78,
  "challenge-5": 96,
  "challenge-hidden": 99,
};

const SINGLE_ATTACK: Record<string, string> = {
  "challenge-1": "47",
  "challenge-2": "164",
  "challenge-3": "75",
  "challenge-4": "184",
  "challenge-5": "184",
  "challenge-hidden": "184",
};

const ALL_ATTACK: Record<string, string> = {
  "challenge-1": "49",
  "challenge-2": "42",
  "challenge-3": "77",
  "challenge-4": "177",
  "challenge-5": "177",
  "challenge-hidden": "177",
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function party(challengeId: string): BattleParticipant[] {
  const level = LEVELS[challengeId]!;
  const stat = Math.round(level * 1.35);
  const hp = 700 + level * 24;
  const skills = [SINGLE_ATTACK[challengeId]!, ALL_ATTACK[challengeId]!, "90", "175", "185", "186", "103"];
  return Array.from({ length: 4 }, (_, index) => ({
    id: `sim-player-${index + 1}`,
    side: "player" as const,
    displayName: `模拟成员 ${index + 1}`,
    level,
    hp: { current: hp, max: hp },
    mp: { current: 9999, max: 9999 },
    attack: stat,
    defense: stat,
    agility: stat,
    intelligence: stat,
    isDown: false,
    isActive: true,
    canAct: true,
    skillIds: skills,
    availableSkillIds: new Set(skills),
    statusEffects: [],
  }));
}

function living(snapshot: BattleSnapshot, side: "player" | "enemy") {
  return snapshot.participants.filter(participant => participant.side === side && participant.isActive && !participant.isDown);
}

function preferredTarget(snapshot: BattleSnapshot, challengeId: string): BattleParticipant | undefined {
  const enemies = living(snapshot, "enemy");
  if (challengeId === "challenge-2") {
    return ["102", "103", "101"].map(id => enemies.find(enemy => enemy.enemyId === id)).find(Boolean) ?? enemies[0];
  }
  if (challengeId === "challenge-hidden") {
    return enemies.find(enemy => enemy.enemyId === "107") ?? enemies[0];
  }
  return enemies[0];
}

function chooseAction(snapshot: BattleSnapshot, challengeId: string, policy: ChallengePolicy): { skillId: string; targetId: string } {
  const actor = snapshot.participants.find(participant => participant.id === snapshot.currentActorId)!;
  const players = living(snapshot, "player");
  const wounded = [...players].sort((a, b) => a.hp.current / a.hp.max - b.hp.current / b.hp.max)[0]!;
  const target = preferredTarget(snapshot, challengeId)!;
  const actorIndex = players.findIndex(player => player.id === actor.id);
  const turn = snapshot.turnCount ?? 1;
  if (policy === "sustain" && wounded.hp.current / wounded.hp.max < 0.72) return { skillId: "90", targetId: wounded.id };
  if (policy === "control" && actorIndex === 0 && turn % 3 === 1) return { skillId: "186", targetId: target.id };
  if (policy === "balanced" && actorIndex === 0 && turn % 4 === 1) return { skillId: "185", targetId: actor.id };
  if (policy === "sustain" && actorIndex === 0 && turn % 4 === 1) return { skillId: "175", targetId: target.id };
  const phase = snapshot.bossRuntime == null ? undefined : Object.values(snapshot.bossRuntime.phaseByActorId)[0];
  const stageOneSkill = challengeId === "challenge-1" && phase === "steam"
    ? (policy === "balanced" ? "63" : "61")
    : undefined;
  const skillId = stageOneSkill ?? (policy === "burst" ? SINGLE_ATTACK[challengeId]! : ALL_ATTACK[challengeId]!);
  const skill = getSkill(skillId);
  return { skillId, targetId: skill.targetType === "self" ? actor.id : target.id };
}

function invariants(snapshot: BattleSnapshot): string[] {
  const errors: string[] = [];
  for (const participant of snapshot.participants) {
    if (!Number.isFinite(participant.hp.current)) errors.push(`${participant.id}:non-finite-hp`);
    if (participant.hp.current < 0 || participant.hp.current > participant.hp.max) errors.push(`${participant.id}:hp-bounds`);
  }
  const sequences = (snapshot.battleLog ?? []).map(entry => entry.sequence);
  if (sequences.some((sequence, index) => index > 0 && sequence <= sequences[index - 1]!)) errors.push("log-sequence");
  return errors;
}

export function simulateChallenge(challengeId: string, policy: ChallengePolicy, seed: number, maxTurns = 80): ChallengeSimulationResult {
  const enemies = ENCOUNTERS[challengeId];
  if (enemies == null) throw new Error(`Unknown challenge ${challengeId}`);
  registerChallengeBossProfiles();
  const pending = createPendingBattleSnapshot({
    encounterId: `simulation/${challengeId}/${policy}/${seed}`,
    narrativeReason: "固定种子挑战模拟",
    source: "training/challenge",
    enemies: enemies.map(enemy_id => ({ enemy_id, count: 1 })),
  });
  const playerParty = party(challengeId);
  let snapshot = createBattleSnapshotFromPendingBattle({ pendingBattle: pending, playerParty });
  snapshot.participants = [
    ...playerParty,
    ...pending.enemies.map(createEnemyBattleParticipant),
  ];
  const originalRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
    let steps = 0;
    while (snapshot.lifecycleState !== "RESOLVED" && (snapshot.turnCount ?? 1) <= maxTurns && steps < maxTurns * 20) {
      steps += 1;
      if (snapshot.phase === "ENEMY_TURN") {
        snapshot = resolveEnemyTurn(snapshot);
        continue;
      }
      if (snapshot.phase !== "PLAYER_COMMAND" || snapshot.currentActorId == null) break;
      if (living(snapshot, "enemy").length === 0) {
        snapshot = resolveEnemyTurn({ ...snapshot, phase: "ENEMY_TURN" });
        continue;
      }
      const action = chooseAction(snapshot, challengeId, policy);
      snapshot = resolveSelectedBattleAction({ ...snapshot, selectedActionId: "basic-skill", selectedContentId: action.skillId, selectedTargetId: action.targetId });
    }
  } finally {
    Math.random = originalRandom;
  }
  return {
    outcome: snapshot.battleResult?.outcome === "victory" ? "victory" : snapshot.battleResult?.outcome === "defeat" ? "defeat" : "timeout",
    turns: snapshot.turnCount ?? maxTurns,
    snapshot,
    invariantErrors: invariants(snapshot),
  };
}


