import type { BattleElement } from "@/types/battle";

// ── CombatStats (mirrors schema's combatStats shape) ──

export interface CombatStats {
  level: number;
  exp: number;
  hp: { current: number; max: number };
  mp: { current: number; max: number };
  attack: number;
  defense: number;
  agility: number;
  intelligence: number;
}

// ── Skill Content (one line in skills.jsonl) ──

export const SKILL_CATEGORIES = [
  "physical",
  "magic",
  "heal",
  "support",
  "passive",
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SKILL_TARGET_TYPES = [
  "single_enemy",
  "all_enemies",
  "single_ally",
  "all_allies",
  "self",
] as const;
export type SkillTargetType = (typeof SKILL_TARGET_TYPES)[number];

export interface StatusEffectPayload {
  effectId: string;
  chance: number; // 0–200
}

export interface SkillContent {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  element: string; // element name mapped to BattleElement bit at load time
  power: number;
  mpCost: number;
  targetType: SkillTargetType;
  accuracy: number; // 0–200, base hit chance
  statDriver: "attack" | "intelligence";
  critRate?: number; // per-skill bonus crit rate, additive with base
  hitCount?: number; // min hits, default 1
  hitCountMax?: number; // max hits for random range, default = hitCount
  statusEffects?: StatusEffectPayload[];
}

// ── Enemy Content (one line in enemies.jsonl) ──

export interface EnemyAffinitiesRaw {
  weak: string[];
  resist: string[];
  nullify: string[];
  reflect: string[];
  absorb: string[];
}

export interface EnemyStats {
  hp: number;
  mp: number;
  attack: number;
  defense: number;
  agility: number;
  intelligence: number;
}

export interface EnemyContent {
  id: string;
  name: string;
  baseLevel: number;
  stats: EnemyStats;
  affinities: EnemyAffinitiesRaw;
  skills: string[];
  expReward: number;
  moneyReward: number;
}

// ── Growth Content (one line in growth.jsonl) ──

export interface GrowthStats {
  hp: number;
  mp: number;
  attack: number;
  defense: number;
  agility: number;
  intelligence: number;
  freePoints?: number;
}

export interface GrowthContent {
  id: string;
  base: GrowthStats;
  perLevel: GrowthStats;
}

// ── Item Content (one line in items.jsonl) ──

export const ITEM_TYPES = ["consumable", "accessory"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TIERS = ["common", "uncommon", "rare", "legendary"] as const;
export type ItemTier = (typeof ITEM_TIERS)[number];

export const ITEM_ACCESSORY_EFFECTS = [
  "auto_buff_start",
  "no_press_penalty",
  "pass_free",
  "miss_consume_all",
] as const;
export type ItemAccessoryEffect = (typeof ITEM_ACCESSORY_EFFECTS)[number];

export type AccessoryModifiers = Partial<
  Pick<CombatStats, "attack" | "defense" | "agility" | "intelligence">
>;

export interface ItemContent {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  tier: ItemTier;
  price: number;
  // consumable
  healHp?: number;
  healMp?: number;
  usableInBattle?: boolean;
  revivePercent?: number;
  cureStatus?: string[];
  damageFixed?: number;
  tempModifiers?: {
    stats: AccessoryModifiers;
    duration: number;
  };
  // accessory
  modifiers?: AccessoryModifiers;
  accessoryEffects?: ItemAccessoryEffect[];
  affinityResist?: Partial<Record<string, "resist" | "nullify" | "reflect" | "absorb">>;
}

// ── Formula Parameters (single-line formulas.jsonl) ──

export interface FormulaParams {
  damage: {
    varianceMin: number;
    varianceMax: number;
    levelInfluence: number;
    minDamage: number;
  };
  affinity: {
    weak: number;
    resist: number;
    nullify: number;
    normal: number;
  };
  hitRate: {
    agilityInfluence: number;
    minHitRate: number;
    maxHitRate: number;
  };
  critRate: {
    base: number;
    agilityBonus: number;
    max: number;
  };
  exp: {
    baseExpToNext: number;
    levelExponent: number;
  };
  guard: {
    damageReduction: number;
  };
}

// ── Status Effect Content (one line in status_effects.jsonl) ──

export const STATUS_EFFECT_TYPES = [
  "dot",
  "hot",
  "buff",
  "debuff",
  "ailment",
] as const;
export type StatusEffectType = (typeof STATUS_EFFECT_TYPES)[number];

export interface StatusEffectContent {
  id: string;
  name: string;
  type: StatusEffectType;
  duration: number;
  statModifiers?: Partial<
    Pick<CombatStats, "attack" | "defense" | "agility" | "intelligence">
  >;
  damagePercent?: number;
  healPercent?: number;
  stackable: boolean;
}

// ── Resolved types (element names resolved to bitmask numbers) ──

import type { BattleAffinityProfile } from "@/types/battle";

export interface ResolvedSkillContent extends Omit<SkillContent, "element"> {
  element: BattleElement;
}

export interface ResolvedEnemyContent extends Omit<EnemyContent, "affinities"> {
  affinities: BattleAffinityProfile;
}

export interface StatusEffectTickResult {
  hpDelta: number;
  mpDelta: number;
  statChanges: Partial<
    Pick<CombatStats, "attack" | "defense" | "agility" | "intelligence">
  >;
  expired: boolean;
}
