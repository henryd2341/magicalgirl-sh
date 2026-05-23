import { createDefaultBattleCommandMenuTree } from "@/engine/battle/battleActionCatalog";
import { createPressTurnStateForSide } from "@/engine/battle/pressTurn";
import type { TriggerBattleEnemyInput } from "@/orchestrator/toolEnvelope";

export const BATTLE_LIFECYCLE_STATES = [
  "PENDING",
  "ACTIVE",
  "RESOLVED",
] as const;

export type BattleLifecycleState = (typeof BATTLE_LIFECYCLE_STATES)[number];

export const BATTLE_PHASES = [
  "PLAYER_COMMAND",
  "PLAYER_RESOLUTION",
  "ENEMY_TURN",
  "RESULT",
] as const;

export type BattlePhase = (typeof BATTLE_PHASES)[number];

export const COMBATANT_SIDES = ["player", "enemy"] as const;

export type CombatantSide = (typeof COMBATANT_SIDES)[number];

export const BATTLE_RESULT_OUTCOMES = ["victory", "defeat", "escape"] as const;

export type BattleResultOutcome = (typeof BATTLE_RESULT_OUTCOMES)[number];

export const BATTLE_RESULT_END_REASONS = [
  "all_enemies_down",
  "all_players_down",
  "manual_exit",
] as const;

export type BattleResultEndReason = (typeof BATTLE_RESULT_END_REASONS)[number];

export const BATTLE_ELEMENTS = {
  None: 0,
  Physical: 1 << 0,
  Gun: 1 << 1,
  Fire: 1 << 2,
  Ice: 1 << 3,
  Electric: 1 << 4,
  Wind: 1 << 5,
  Earth: 1 << 6,
  Light: 1 << 7,
  Dark: 1 << 8,
  Almighty: 1 << 9,
  Heal: 1 << 10,
  Ailment: 1 << 11,
} as const;

export type BattleElement =
  (typeof BATTLE_ELEMENTS)[keyof typeof BATTLE_ELEMENTS];

export const BATTLE_ACTION_IDS = [
  "attack",
  "guard",
  "pass",
  "swap",
  "basic-skill",
  "basic-item",
] as const;

export type BattleActionId = (typeof BATTLE_ACTION_IDS)[number];

export const BATTLE_ACTION_SELECTION_MODES = ["none", "selective"] as const;

export type BattleActionSelectionMode =
  (typeof BATTLE_ACTION_SELECTION_MODES)[number];

export const BATTLE_ACTION_RESOLUTION_KINDS = [
  "attack",
  "skill",
  "item",
  "pass",
  "swap",
  "unimplemented",
] as const;

export type BattleActionResolutionKind =
  (typeof BATTLE_ACTION_RESOLUTION_KINDS)[number];

export const PRESS_TURN_ICON_STATES = ["solid", "blinking"] as const;

export type PressTurnIconState = (typeof PRESS_TURN_ICON_STATES)[number];

export const BATTLE_ACTION_VALIDATION_ERRORS = [
  "action_not_found",
  "target_required",
  "target_not_found",
  "target_not_allowed",
  "insufficient_mp",
  "insufficient_hp",
  "insufficient_item",
  "no_press_turn_icons",
  "phase_invalid",
  "swap_out_required",
  "swap_out_not_found",
  "swap_out_not_active",
  "swap_in_not_found",
  "swap_in_not_reserve",
  "swap_in_down",
  "swap_unavailable",
] as const;

export type BattleActionValidationError =
  (typeof BATTLE_ACTION_VALIDATION_ERRORS)[number];

export const BATTLE_ACTION_OUTCOME_TYPES = [
  "hit",
  "miss",
  "status_no_effect",
  "block",
  "reflect",
  "absorb",
] as const;

export type BattleActionOutcomeType =
  (typeof BATTLE_ACTION_OUTCOME_TYPES)[number];

export const BATTLE_ACTION_OUTCOME_TAGS = [
  "weak",
  "critical",
  "resisted",
] as const;

export type BattleActionOutcomeTag =
  (typeof BATTLE_ACTION_OUTCOME_TAGS)[number];

export const PRESS_TURN_SETTLEMENT_KINDS = [
  "consume_one",
  "consume_two",
  "consume_all",
  "reward_half_turn",
  "no_change",
] as const;

export type PressTurnSettlementKind =
  (typeof PRESS_TURN_SETTLEMENT_KINDS)[number];

export interface BattleEnemyInstance {
  instanceId: string;
  enemyId: string;
  displayName: string;
  side: "enemy";
}

export interface BattleAffinityProfile {
  weak: number;
  resist: number;
  nullify: number;
  reflect: number;
  absorb: number;
}

export interface BattleParticipantCombatStats {
  accuracy: number;
  evasion: number;
  critRate: number;
}

export interface BattleParticipant {
  id: string;
  side: CombatantSide;
  displayName: string;
  level?: number;
  hp: {
    current: number;
    max: number;
  };
  mp: {
    current: number;
    max: number;
  };
  isDown: boolean;
  isActive: boolean;
  statusEffects?: string[];
  affinities?: BattleAffinityProfile;
  combatStats?: BattleParticipantCombatStats;
  canAct?: boolean;
}

export interface BattleResult {
  outcome: BattleResultOutcome;
  winningSide?: CombatantSide;
  endReason: BattleResultEndReason;
  turnCount: number;
  survivingParticipantIds: string[];
  downParticipantIds: string[];
}

export interface BattleLogEntry {
  id: string;
  turnCount: number;
  side: CombatantSide | "system";
  actorId?: string;
  actionId?: string;
  targetId?: string;
  summary: string;
}

export interface PressTurnIcon {
  id: string;
  state: PressTurnIconState;
}

export interface PressTurnState {
  ownerSide: CombatantSide;
  icons: PressTurnIcon[];
}

export interface PressTurnAllocation {
  participantIds: string[];
  initialIconCount: number;
}

export interface BattleActionDefinition {
  id: BattleActionId;
  label: string;
  description: string;
  selectionMode: BattleActionSelectionMode;
  allowedSides: CombatantSide[];
  resolutionKind: BattleActionResolutionKind;
}

export interface BattleActionMenuNode {
  id: string;
  label: string;
  description: string;
  kind: "action" | "group";
  actionId?: BattleActionId;
  children?: BattleActionMenuNode[];
}

export interface BattleActionOutcome {
  type: BattleActionOutcomeType;
  tags: BattleActionOutcomeTag[];
  actorId: string;
  primaryTargetId?: string | null;
  finalTargetId?: string | null;
  hpDelta?: number;
  mpDelta?: number;
  appliedStatusEffects?: string[];
  preventedBy?: "nullify" | "reflect" | "absorb";
}

export interface AggregatedPressTurnOutcome {
  outcomeType: BattleActionOutcomeType;
  tags: BattleActionOutcomeTag[];
}

export interface PressTurnSettlementResult {
  kind: PressTurnSettlementKind;
  reason:
    | "pass"
    | "swap"
    | "hit"
    | "weak"
    | "critical"
    | "miss"
    | "block"
    | "reflect"
    | "absorb"
    | "status_no_effect";
  before: PressTurnState;
  after: PressTurnState;
}

export interface BattleActionResolution {
  ok: boolean;
  validationError?: BattleActionValidationError;
  actorId: string;
  actionId: BattleActionId;
  intendedTargetId?: string | null;
  outcomes: BattleActionOutcome[];
  pressTurnResult?: PressTurnSettlementResult;
  verboseLog: string[];
  summaryLog: string[];
}

export interface PendingBattleSnapshot {
  lifecycleState: "PENDING";
  encounterId: string;
  narrativeReason: string;
  enemies: BattleEnemyInstance[];
}

export interface BattleSnapshot {
  lifecycleState: BattleLifecycleState;
  phase: BattlePhase;
  encounterId: string;
  participants: BattleParticipant[];
  pressTurn: PressTurnState;
  pressTurnAllocation?: PressTurnAllocation;
  turnCount?: number;
  selectedTargetId?: string | null;
  currentActorId?: string | null;
  currentMenuNodeId?: string | null;
  selectedActionId?: BattleActionId | null;
  selectedSwapOutParticipantId?: string | null;
  selectedSwapInParticipantId?: string | null;
  actionMenu?: BattleActionMenuNode[];
  battleResult?: BattleResult;
  resultSummary?: string;
  battleLog?: BattleLogEntry[];
}

export interface CreatePendingBattleSnapshotInput {
  encounterId: string;
  narrativeReason: string;
  enemies: TriggerBattleEnemyInput[];
}

export interface CreateBattleSnapshotFromPendingBattleInput {
  pendingBattle: PendingBattleSnapshot;
  playerParty: BattleParticipant[];
}

export function expandTriggerBattleEnemies(
  enemies: TriggerBattleEnemyInput[],
): BattleEnemyInstance[] {
  const expanded: BattleEnemyInstance[] = [];
  let runningIndex = 1;

  for (const enemy of enemies) {
    for (let countIndex = 0; countIndex < enemy.count; countIndex += 1) {
      expanded.push({
        instanceId: `enemy-${runningIndex}`,
        enemyId: enemy.enemy_id,
        displayName: enemy.enemy_id,
        side: "enemy",
      });
      runningIndex += 1;
    }
  }

  return expanded;
}

export function createPendingBattleSnapshot(
  input: CreatePendingBattleSnapshotInput,
): PendingBattleSnapshot {
  return {
    lifecycleState: "PENDING",
    encounterId: input.encounterId,
    narrativeReason: input.narrativeReason,
    enemies: expandTriggerBattleEnemies(input.enemies),
  };
}

export function createBattleSnapshotFromPendingBattle(
  input: CreateBattleSnapshotFromPendingBattleInput,
): BattleSnapshot {
  const playerParticipants: BattleParticipant[] = input.playerParty.map(
    (participant) => ({
      ...participant,
      level: participant.level ?? 1,
      isActive: participant.isActive ?? true,
      statusEffects: participant.statusEffects ?? [],
      affinities: participant.affinities ?? {
        weak: 0,
        resist: 0,
        nullify: 0,
        reflect: 0,
        absorb: 0,
      },
      combatStats: participant.combatStats ?? {
        accuracy: 100,
        evasion: 100,
        critRate: 0,
      },
      canAct: participant.canAct ?? true,
    }),
  );

  const enemyParticipants: BattleParticipant[] =
    input.pendingBattle.enemies.map((enemy) => ({
      id: enemy.instanceId,
      side: "enemy",
      displayName: enemy.displayName,
      level: 1,
      hp: {
        current: 1,
        max: 1,
      },
      mp: {
        current: 0,
        max: 0,
      },
      isDown: false,
      isActive: true,
      statusEffects: [],
      affinities: {
        weak: 0,
        resist: 0,
        nullify: 0,
        reflect: 0,
        absorb: 0,
      },
      combatStats: {
        accuracy: 100,
        evasion: 100,
        critRate: 0,
      },
      canAct: true,
    }));

  const participants = [...playerParticipants, ...enemyParticipants];
  const playerActingParticipantIds = playerParticipants
    .filter(
      (participant) =>
        participant.isActive &&
        !participant.isDown &&
        participant.canAct !== false,
    )
    .map((participant) => participant.id);

  return {
    lifecycleState: "ACTIVE",
    phase: "PLAYER_COMMAND",
    encounterId: input.pendingBattle.encounterId,
    participants,
    pressTurn: createPressTurnStateForSide(participants, "player"),
    pressTurnAllocation: {
      participantIds: playerActingParticipantIds,
      initialIconCount: playerActingParticipantIds.length,
    },
    turnCount: 1,
    selectedTargetId: enemyParticipants[0]?.id ?? null,
    currentActorId: playerParticipants[0]?.id ?? null,
    currentMenuNodeId: null,
    selectedActionId: null,
    selectedSwapOutParticipantId: null,
    selectedSwapInParticipantId: null,
    actionMenu: createDefaultBattleCommandMenuTree(),
    battleResult: undefined,
    battleLog: [],
  };
}
