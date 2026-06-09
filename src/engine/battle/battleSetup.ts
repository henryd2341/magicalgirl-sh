import { getEnemy, getFormulaParams, getGrowth } from "@/content/contentRegistry";
import {
  computeDerivedCombatStats,
  computeGrowthStats,
  statsAtLevel,
  type AllocatedPoints,
} from "@/engine/battle/formulaEngine";
import type {
  BattleEnemyInstance,
  BattleParticipant,
  BattleSnapshot,
  CreateBattleSnapshotFromPendingBattleInput,
  CreatePendingBattleSnapshotInput,
  PendingBattleSnapshot,
} from "@/types/battle";
import type { TriggerBattleEnemyInput } from "@/orchestrator/toolEnvelope";
import {
  createDefaultBattleCommandMenuTree,
} from "@/engine/battle/battleActionCatalog";
import {
  createPressTurnStateForSide,
} from "@/engine/battle/pressTurn";
import { resolvePassiveEffects } from "@/engine/battle/passiveEffectEngine";

/**
 * Build a BattleParticipant from content data for an enemy.
 */
export function createEnemyBattleParticipant(
  enemy: BattleEnemyInstance,
): BattleParticipant {
  let level = 1;
  let hp = 5;
  let mp = 0;
  let attack = 5;
  let defense = 3;
  let agility = 5;
  let intelligence = 3;
  let displayName = enemy.displayName;
  let affinities = { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 };

  try {
    const enemyDef = getEnemy(enemy.enemyId);
    level = enemyDef.baseLevel;
    hp = enemyDef.stats.hp;
    mp = enemyDef.stats.mp;
    attack = enemyDef.stats.attack;
    defense = enemyDef.stats.defense;
    agility = enemyDef.stats.agility;
    intelligence = enemyDef.stats.intelligence;
    displayName = enemyDef.name;
    affinities = enemyDef.affinities;
  } catch {
    // Enemy not in content registry, use defaults
  }

  const params = getFormulaParams();
  const derived = computeDerivedCombatStats(
    agility,
    params.hitRate,
    params.critRate,
  );

  return {
    id: enemy.instanceId,
    side: "enemy",
    displayName,
    level,
    hp: {
      current: hp,
      max: hp,
    },
    mp: {
      current: mp,
      max: mp,
    },
    attack,
    defense,
    agility,
    intelligence,
    isDown: false,
    isActive: true,
    statusEffects: [],
    affinities,
    combatStats: derived,
    canAct: true,
  };
}

/**
 * Build a BattleParticipant for a player character using their growth table
 * and manually allocated stat points.
 *
 * HP/MP auto-scale from the growth table; atk/def/agi/int use
 * base stats + allocatedPoints + accessory modifiers.
 */
export function createPlayerBattleParticipant(
  id: string,
  displayName: string,
  level: number,
  growthId: string,
  allocatedPoints: AllocatedPoints,
  characterId?: string,
  accessoryModifiers?: Partial<Pick<BattleParticipant, "attack" | "defense" | "agility" | "intelligence">>,
  skillIds?: string[],
): BattleParticipant {
  const growth = getGrowth(growthId);
  const params = getFormulaParams();

  // HP/MP auto-scale from growth table
  const hpMp = statsAtLevel(growth.base, growth.perLevel, level);

  // atk/def/agi/int = base + allocated + accessory
  const stats = computeGrowthStats(growth.base, allocatedPoints);

  const attack = stats.attack + (accessoryModifiers?.attack ?? 0);
  const defense = stats.defense + (accessoryModifiers?.defense ?? 0);
  const agility = stats.agility + (accessoryModifiers?.agility ?? 0);
  const intelligence = stats.intelligence + (accessoryModifiers?.intelligence ?? 0);

  const derived = computeDerivedCombatStats(
    agility,
    params.hitRate,
    params.critRate,
  );

  // Resolve passive effects from skill IDs
  const passiveEffects = resolvePassiveEffects(skillIds ?? []);
  let combatStats = derived;

  // Apply crit_boost passive to combatStats.critRate
  for (const pe of passiveEffects) {
    if (pe.hook === "on_damage_calc" && pe.type === "crit_boost") {
      combatStats = {
        ...combatStats,
        critRate: combatStats.critRate + pe.value,
      };
    }
  }

  return {
    id,
    side: "player",
    displayName,
    characterId,
    level,
    hp: {
      current: hpMp.hp.current,
      max: hpMp.hp.max,
    },
    mp: {
      current: hpMp.mp.current,
      max: hpMp.mp.max,
    },
    attack,
    defense,
    agility,
    intelligence,
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
    combatStats,
    skillIds,
    passiveEffects: passiveEffects.length > 0 ? passiveEffects : undefined,
    canAct: true,
  };
}

import type { GameVariablesRoot } from "@/types/variables";

/**
 * Build a BattleParticipant for the protagonist from player.combat variable state.
 */
export function createProtagonistBattleParticipant(
  vars: GameVariablesRoot,
): BattleParticipant {
  const playerCombat = vars.player.combat;
  const growth = getGrowth("player");
  const params = getFormulaParams();
  const derived = computeDerivedCombatStats(
    playerCombat.agility,
    params.hitRate,
    params.critRate,
  );

  const displayName = vars.player.profile.name || "主角";

  return {
    id: "player-heroine-1",
    side: "player",
    displayName,
    characterId: "__player__",
    level: playerCombat.level,
    hp: {
      current: playerCombat.hp.current,
      max: playerCombat.hp.max,
    },
    mp: {
      current: playerCombat.mp.current,
      max: playerCombat.mp.max,
    },
    attack: playerCombat.attack,
    defense: playerCombat.defense,
    agility: playerCombat.agility,
    intelligence: playerCombat.intelligence,
    isDown: false,
    isActive: true,
    statusEffects: [],
    affinities: { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 },
    combatStats: derived,
    skillIds: vars.player.equippedSkills ?? [],
    passiveEffects: undefined,
    canAct: true,
  };
}

/**
 * Build the full player party from variable state and formation data.
 * Protagonist is always in vanguard slot 0.
 */
export function buildPlayerPartyFromFormation(
  vars: GameVariablesRoot,
  vanguardIds: string[],
  growthIdOverrides?: Record<string, string>,
): BattleParticipant[] {
  const party: BattleParticipant[] = [];

  // Protagonist is always first
  party.push(createProtagonistBattleParticipant(vars));

  // Add each vanguard character (skip "__player__" sentinel)
  for (const charId of vanguardIds) {
    if (charId === "__player__") continue;
    const charData = vars.characters[charId];
    if (!charData?.combat) continue;

    const growthId = growthIdOverrides?.[charId] ?? "player";
    const participant = createPlayerBattleParticipant(
      charId,
      charData.displayName,
      charData.combat.level,
      growthId,
      charData.combat.allocatedPoints ?? { attack: 0, defense: 0, agility: 0, intelligence: 0 },
      charId,
      undefined,
      charData.equippedSkills ?? [],
    );
    party.push(participant);
  }

  return party;
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
      passiveEffects: participant.passiveEffects
        ?? (participant.skillIds != null ? resolvePassiveEffects(participant.skillIds) : undefined),
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
    swapPhase: "idle",
  };
}
