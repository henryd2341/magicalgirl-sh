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
  "guard",
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
  "no_valid_targets",
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
  "actor_not_found",
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

export interface ActiveStatusEffect {
  effectId: string;
  remainingDuration: number;
  stacks: number;
}

export interface BattleParticipant {
  id: string;
  side: CombatantSide;
  displayName: string;
  characterId?: string;
  level?: number;
  hp: {
    current: number;
    max: number;
  };
  mp: {
    current: number;
    max: number;
  };
  attack?: number;
  defense?: number;
  agility?: number;
  intelligence?: number;
  isDown: boolean;
  isActive: boolean;
  statusEffects?: ActiveStatusEffect[];
  affinities?: BattleAffinityProfile;
  combatStats?: BattleParticipantCombatStats;
  canAct?: boolean;
  passiveEffects?: import("@/types/content").PassiveEffectDef[];
  endureUsed?: boolean;
  skillIds?: string[];
  availableSkillIds?: Set<string>;
}

export interface BattleResult {
  outcome: BattleResultOutcome;
  winningSide?: CombatantSide;
  endReason: BattleResultEndReason;
  turnCount: number;
  survivingParticipantIds: string[];
  downParticipantIds: string[];
}

export interface BattleSummarySet {
  verbose: string;
  default: string;
  minimal: string;
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
  contentId?: string;
  children?: BattleActionMenuNode[];
  disabled?: boolean;
}

export interface AppliedStatusEffectPayload {
  effectId: string;
  duration: number;
}

export interface BattleActionOutcome {
  type: BattleActionOutcomeType;
  tags: BattleActionOutcomeTag[];
  actorId: string;
  primaryTargetId?: string | null;
  finalTargetId?: string | null;
  hpDelta?: number;
  mpDelta?: number;
  appliedStatusEffects?: AppliedStatusEffectPayload[];
  consumedShieldEffectId?: string;
  removedStatusEffectIds?: string[];
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
  contentId?: string;
  intendedTargetId?: string | null;
  outcomes: BattleActionOutcome[];
  pressTurnResult?: PressTurnSettlementResult;
  consumedItemId?: string;
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
  selectedContentId?: string | null;
  selectedSwapOutParticipantId?: string | null;
  selectedSwapInParticipantId?: string | null;
  actionMenu?: BattleActionMenuNode[];
  battleResult?: BattleResult;
  resultSummary?: string;
  battleLog?: BattleLogEntry[];
  /** Transient: set after item use, consumed by store layer */
  consumedItemId?: string | null;
  /** Swap UI phase: idle, selecting swap-out target, or selecting swap-in target */
  swapPhase?: "idle" | "select_out" | "select_in";
  /** Transient: expected targetType hint for basic-skill target selection UI */
  _targetTypeHint?: "single_enemy" | "single_ally" | null;
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
