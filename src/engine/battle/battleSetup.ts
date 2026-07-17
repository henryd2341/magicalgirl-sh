import { getCharacter, getEnemy, getFormulaParams, getGrowth, getItem } from "@/content/contentRegistry";
import {
  computeDerivedCombatStats,
  computeGrowthStats,
  statsAtLevel,
  type AllocatedPoints,
} from "@/engine/battle/formulaEngine";
import { BATTLE_ELEMENTS } from "@/types/battle";
import type {
  BattleAffinityProfile,
  BattleEnemyInstance,
  BattleParticipant,
  BattleSnapshot,
  CreateBattleSnapshotFromPendingBattleInput,
  CreatePendingBattleSnapshotInput,
  PendingBattleSnapshot,
} from "@/types/battle";
import type { TriggerBattleEnemyInput } from "@/orchestrator/toolEnvelope";
import type { ItemAccessoryEffect, ItemContent } from "@/types/content";
import {
  createDefaultBattleCommandMenuTree,
} from "@/engine/battle/battleActionCatalog";
import {
  createPressTurnStateForSide,
} from "@/engine/battle/pressTurn";
import { resolvePassiveEffects } from "@/engine/battle/passiveEffectEngine";
import {
  findBossProfileByEnemyId,
  getBossProfile,
} from "@/engine/battle/boss/bossRegistry";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";

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

  let skillIds: string[] | undefined;
  let statusImmunities: string[] | undefined;

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
    skillIds = enemyDef.skills.length > 0 ? [...enemyDef.skills] : undefined;
    statusImmunities = enemyDef.statusImmunities == null
      ? undefined
      : [...enemyDef.statusImmunities];
  } catch {
    // Enemy not in content registry, use defaults
  }

  const params = getFormulaParams();
  const derived = computeDerivedCombatStats(
    agility,
    params.hitRate,
    params.critRate,
  );

  const passiveEffects = resolvePassiveEffects(skillIds ?? []);

  return {
    id: enemy.instanceId,
    enemyId: enemy.enemyId,
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
    ...(statusImmunities == null ? {} : { statusImmunities }),
    affinities,
    combatStats: derived,
    skillIds,
    passiveEffects: passiveEffects.length > 0 ? passiveEffects : undefined,
    canAct: true,
  };
}

export function createSummonedEnemyParticipant(
  enemyId: string,
  participants: readonly BattleParticipant[],
): BattleParticipant {
  const usedIds = new Set(participants.map((participant) => participant.id));
  let sequence = 1;
  let instanceId = `boss-summon-${enemyId}-${sequence}`;
  while (usedIds.has(instanceId)) {
    sequence += 1;
    instanceId = `boss-summon-${enemyId}-${sequence}`;
  }
  return createEnemyBattleParticipant({
    instanceId,
    enemyId,
    displayName: `召回 ${enemyId}`,
    side: "enemy",
  });
}

interface PlayerParticipantOptions {
  hp?: BattleParticipant["hp"];
  mp?: BattleParticipant["mp"];
  affinities?: BattleAffinityProfile;
  accessoryEffects?: ItemAccessoryEffect[];
  permanentBonuses?: AllocatedPoints;
}

function affinityMaskFromNames(names: readonly string[]): number {
  return names.reduce((mask, name) => {
    const bit = BATTLE_ELEMENTS[name as keyof typeof BATTLE_ELEMENTS] ?? 0;
    return mask | bit;
  }, 0);
}

function characterAffinities(characterId: string): BattleAffinityProfile {
  try {
    const raw = getCharacter(characterId).affinities;
    return {
      weak: affinityMaskFromNames(raw.weak),
      resist: affinityMaskFromNames(raw.resist),
      nullify: affinityMaskFromNames(raw.nullify),
      reflect: affinityMaskFromNames(raw.reflect),
      absorb: affinityMaskFromNames(raw.absorb),
    };
  } catch {
    return { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 };
  }
}

function applyAccessoryAffinity(
  base: BattleAffinityProfile,
  item?: ItemContent,
): BattleAffinityProfile {
  const next = { ...base };
  for (const [elementName, affinity] of Object.entries(item?.affinityResist ?? {})) {
    const bit = BATTLE_ELEMENTS[elementName as keyof typeof BATTLE_ELEMENTS] ?? 0;
    if (bit === 0 || affinity == null) continue;
    next.weak &= ~bit;
    next.resist &= ~bit;
    next.nullify &= ~bit;
    next.reflect &= ~bit;
    next.absorb &= ~bit;
    next[affinity] |= bit;
  }
  return next;
}

function equippedAccessory(itemId: string | null | undefined): ItemContent | undefined {
  if (itemId == null) return undefined;
  try {
    const item = getItem(itemId);
    return item.type === "accessory" ? item : undefined;
  } catch {
    return undefined;
  }
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
  options: PlayerParticipantOptions = {},
): BattleParticipant {
  const growth = getGrowth(growthId);
  const params = getFormulaParams();

  // HP/MP auto-scale from growth table
  const hpMp = statsAtLevel(growth.base, growth.perLevel, level);

  // atk/def/agi/int = base + allocated + accessory
  const stats = computeGrowthStats(growth.base, allocatedPoints);

  const permanent = options.permanentBonuses ?? { attack: 0, defense: 0, agility: 0, intelligence: 0 };
  const attack = Math.min(99, stats.attack + permanent.attack) + (accessoryModifiers?.attack ?? 0);
  const defense = Math.min(99, stats.defense + permanent.defense) + (accessoryModifiers?.defense ?? 0);
  const agility = Math.min(99, stats.agility + permanent.agility) + (accessoryModifiers?.agility ?? 0);
  const intelligence = Math.min(99, stats.intelligence + permanent.intelligence) + (accessoryModifiers?.intelligence ?? 0);

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
    hp: options.hp ?? {
      current: hpMp.hp.current,
      max: hpMp.hp.max,
    },
    mp: options.mp ?? {
      current: hpMp.mp.current,
      max: hpMp.mp.max,
    },
    attack,
    defense,
    agility,
    intelligence,
    isDown: false,
    isActive: true,
    statusEffects: options.accessoryEffects?.includes("auto_buff_start")
      ? [
          { effectId: "attack_up", remainingDuration: 3, stacks: 1 },
          { effectId: "defense_up", remainingDuration: 3, stacks: 1 },
          { effectId: "agility_up", remainingDuration: 3, stacks: 1 },
        ]
      : [],
    affinities: options.affinities ?? {
      weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0,
    },
    combatStats,
    skillIds,
    passiveEffects: passiveEffects.length > 0 ? passiveEffects : undefined,
    accessoryEffects: options.accessoryEffects,
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
  const combat = vars.player.combat;
  const accessory = equippedAccessory(vars.player.equipment.accessory);
  return createPlayerBattleParticipant(
    "player-heroine-1",
    vars.player.profile.name || "主角",
    combat.level,
    "player",
    combat.allocatedPoints,
    "__player__",
    accessory?.modifiers,
    vars.player.equippedSkills ?? [],
    {
      hp: { ...combat.hp },
      mp: { ...combat.mp },
      affinities: applyAccessoryAffinity(characterAffinities("player"), accessory),
      accessoryEffects: accessory?.accessoryEffects,
      permanentBonuses: combat.permanentBonuses,
    },
  );
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
    const accessory = equippedAccessory(charData.equipment?.accessory);
    const participant = createPlayerBattleParticipant(
      charId,
      charData.displayName,
      charData.combat.level,
      growthId,
      charData.combat.allocatedPoints ?? { attack: 0, defense: 0, agility: 0, intelligence: 0 },
      charId,
      accessory?.modifiers,
      charData.equippedSkills ?? [],
      {
        hp: { ...charData.combat.hp },
        mp: { ...charData.combat.mp },
        affinities: applyAccessoryAffinity(characterAffinities(charId), accessory),
        accessoryEffects: accessory?.accessoryEffects,
        permanentBonuses: charData.combat.permanentBonuses,
      },
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
    source: input.source,
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
      enemyId: enemy.enemyId,
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
  const bossRuntime = createEmptyBossRuntimeState();
  for (const enemy of enemyParticipants) {
    if (enemy.enemyId == null) continue;

    let profile = findBossProfileByEnemyId(enemy.enemyId);
    try {
      const explicitProfileId = getEnemy(enemy.enemyId).bossProfileId;
      if (explicitProfileId != null) {
        profile = getBossProfile(explicitProfileId);
      }
    } catch (error) {
      if (profile == null && enemy.enemyId.match(/^[0-9]+$/)) {
        throw error;
      }
    }

    if (profile == null) continue;
    if (!profile.actorEnemyIds.includes(enemy.enemyId)) {
      throw new Error(
        `Boss profile "${profile.id}" does not claim enemy "${enemy.enemyId}"`,
      );
    }
    bossRuntime.profileIds[enemy.id] = profile.id;
    bossRuntime.phaseByActorId[enemy.id] = profile.initialPhase;
    bossRuntime.queuedCounters[enemy.id] = null;
  }
  const hasBossRuntime = Object.keys(bossRuntime.profileIds).length > 0;
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
    source: input.pendingBattle.source,
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
    ...(hasBossRuntime ? { bossRuntime } : {}),
    swapPhase: "idle",
  };
}

