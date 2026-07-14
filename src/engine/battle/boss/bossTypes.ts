import type { BattleSnapshot } from "@/types/battle";

export type BossBattleEvent =
  | { type: "battle_started" }
  | { type: "round_started"; turnCount: number }
  | {
      type: "action_resolved";
      actorId: string;
      actionId: string;
      targetIds: string[];
    }
  | {
      type: "damage_applied";
      sourceId: string;
      targetId: string;
      amount: number;
      element: number;
    }
  | {
      type: "status_applied";
      sourceId: string;
      targetId: string;
      effectId: string;
    }
  | { type: "participant_down"; participantId: string }
  | { type: "before_enemy_action"; actorId: string }
  | { type: "round_ended"; turnCount: number };

export type BossActionIntent =
  | {
      type: "use_skill";
      actorId: string;
      skillId: string;
      targetIds: string[];
      reason: string;
    }
  | { type: "pass"; actorId: string; reason: string }
  | { type: "force_defeat"; skillId: string; reason: string };

export interface BossBattleRuntimeState {
  profileIds: Record<string, string>;
  phaseByActorId: Record<string, string>;
  cooldowns: Record<string, number>;
  queuedCounters: Record<string, string | null>;
  flags: Record<string, boolean>;
  counters: Record<string, number>;
  lists: Record<string, string[]>;
  mechanicState: Record<string, unknown>;
  decisionSteps: number;
}

export interface BossContext {
  snapshot: BattleSnapshot;
  runtime: BossBattleRuntimeState;
  actorId?: string;
}

export type BossEffect =
  | { type: "set_phase"; actorId: string; phase: string }
  | { type: "set_counter"; key: string; value: number }
  | { type: "increment_counter"; key: string; amount: number }
  | { type: "set_flag"; key: string; value: boolean }
  | { type: "enqueue_counter"; actorId: string; skillId: string | null }
  | { type: "set_cooldown"; key: string; turns: number }
  | { type: "set_list"; key: string; values: string[] }
  | { type: "set_mechanic_state"; key: string; value: unknown }
  | { type: "set_affinities"; actorId: string; affinities: import("@/types/battle").BattleAffinityProfile }
  | { type: "apply_status"; actorId: string; effectId: string; duration: number; stacks?: number }
  | {
      type: "append_mechanic_log";
      summary: string;
      details?: string[];
    };

export interface BossUtilityCandidate {
  intent: BossActionIntent;
  available: boolean;
  score: number;
  noise: number;
  stableOrder: number;
  cooldownKey?: string;
}

export function createEmptyBossRuntimeState(): BossBattleRuntimeState {
  return {
    profileIds: {},
    phaseByActorId: {},
    cooldowns: {},
    queuedCounters: {},
    flags: {},
    counters: {},
    lists: {},
    mechanicState: {},
    decisionSteps: 0,
  };
}
