import { z } from "zod";
import type {
  EnemyContent,
  FormulaParams,
  GrowthContent,
  ItemContent,
  ResolvedEnemyContent,
  ResolvedSkillContent,
  SkillContent,
  StatusEffectContent,
} from "@/types/content";
import { BATTLE_ELEMENTS, type BattleElement } from "@/types/battle";

// ── Zod schemas for raw content ──

const statusEffectPayloadSchema = z.object({
  effectId: z.string().min(1),
  chance: z.number().int().min(0).max(100),
});

const skillContentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(["physical", "magic", "heal", "support"]),
  element: z.string().min(1),
  power: z.number().int().min(0),
  mpCost: z.number().int().min(0),
  targetType: z.enum(["single_enemy", "all_enemies", "single_ally", "all_allies", "self"]),
  accuracy: z.number().int().min(0).max(100),
  statDriver: z.enum(["attack", "intelligence"]),
  statusEffects: z.array(statusEffectPayloadSchema).optional(),
});

const combatStatsSchema = z.object({
  hp: z.number().int().min(1),
  mp: z.number().int().min(0),
  attack: z.number().int().min(0),
  defense: z.number().int().min(0),
  agility: z.number().int().min(0),
  intelligence: z.number().int().min(0),
});

const enemyAffinitiesRawSchema = z.object({
  weak: z.array(z.string().min(1)),
  resist: z.array(z.string().min(1)),
  nullify: z.array(z.string().min(1)),
  reflect: z.array(z.string().min(1)),
  absorb: z.array(z.string().min(1)),
});

const enemyContentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseLevel: z.number().int().min(1),
  stats: combatStatsSchema,
  affinities: enemyAffinitiesRawSchema,
  skills: z.array(z.string()),
  expReward: z.number().int().min(0),
  moneyReward: z.number().int().min(0),
});

const growthStatsSchema = z.object({
  hp: z.number().int().min(0),
  mp: z.number().int().min(0),
  attack: z.number().int().min(0),
  defense: z.number().int().min(0),
  agility: z.number().int().min(0),
  intelligence: z.number().int().min(0),
});

const growthContentSchema = z.object({
  id: z.string().min(1),
  base: growthStatsSchema,
  perLevel: growthStatsSchema,
});

const accessoryModifiersSchema = z.object({
  attack: z.number().int().optional(),
  defense: z.number().int().optional(),
  agility: z.number().int().optional(),
  intelligence: z.number().int().optional(),
});

const itemContentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  type: z.enum(["consumable", "accessory"]),
  healHp: z.number().int().min(0).optional(),
  healMp: z.number().int().min(0).optional(),
  usableInBattle: z.boolean().optional(),
  modifiers: accessoryModifiersSchema.optional(),
});

const formulaParamsSchema = z.object({
  damage: z.object({
    varianceMin: z.number(),
    varianceMax: z.number(),
    levelInfluence: z.number(),
    minDamage: z.number().int().min(1),
  }),
  affinity: z.object({
    weak: z.number(),
    resist: z.number(),
    nullify: z.number(),
    normal: z.number(),
  }),
  hitRate: z.object({
    agilityInfluence: z.number(),
    minHitRate: z.number(),
    maxHitRate: z.number(),
  }),
  critRate: z.object({
    base: z.number(),
    agilityBonus: z.number(),
    max: z.number(),
  }),
  exp: z.object({
    baseExpToNext: z.number().int().min(1),
    levelExponent: z.number(),
  }),
  guard: z.object({
    damageReduction: z.number().int().min(0),
  }),
});

const statusEffectContentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["dot", "hot", "buff", "debuff", "ailment"]),
  duration: z.number().int().min(1),
  statModifiers: z.object({
    attack: z.number().int().optional(),
    defense: z.number().int().optional(),
    agility: z.number().int().optional(),
    intelligence: z.number().int().optional(),
  }).optional(),
  damagePercent: z.number().min(0).max(100).optional(),
  healPercent: z.number().min(0).max(100).optional(),
  stackable: z.boolean(),
});

// ── Element name → bitmask mapping ──

const ELEMENT_NAME_MAP: Record<string, BattleElement> = {
  None: BATTLE_ELEMENTS.None,
  Physical: BATTLE_ELEMENTS.Physical,
  Gun: BATTLE_ELEMENTS.Gun,
  Fire: BATTLE_ELEMENTS.Fire,
  Ice: BATTLE_ELEMENTS.Ice,
  Electric: BATTLE_ELEMENTS.Electric,
  Wind: BATTLE_ELEMENTS.Wind,
  Earth: BATTLE_ELEMENTS.Earth,
  Light: BATTLE_ELEMENTS.Light,
  Dark: BATTLE_ELEMENTS.Dark,
  Almighty: BATTLE_ELEMENTS.Almighty,
  Heal: BATTLE_ELEMENTS.Heal,
  Ailment: BATTLE_ELEMENTS.Ailment,
};

function resolveElement(name: string): BattleElement {
  const element = ELEMENT_NAME_MAP[name];
  if (element == null) {
    throw new Error(`Unknown element name: "${name}"`);
  }
  return element;
}

function elementsToMask(names: string[]): number {
  return names.reduce((mask, name) => mask | resolveElement(name), 0);
}

function parseJsonl<T>(raw: string, schema: z.ZodSchema<T>, label: string): T[] {
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    try {
      const parsed = JSON.parse(line);
      return schema.parse(parsed);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[${label}] Line ${index + 1}: ${message}`);
    }
  });
}

// ── Individual raw imports ──
// Using explicit imports instead of import.meta.glob because vitest
// does not support eager ?raw glob patterns for .jsonl files.

import formulasRaw from "./formulas.jsonl?raw";
import enemiesRaw from "./enemies.jsonl?raw";
import skillsRaw from "./skills.jsonl?raw";
import itemsRaw from "./items.jsonl?raw";
import growthRaw from "./growth.jsonl?raw";
import statusEffectsRaw from "./status_effects.jsonl?raw";

const RAW_CONTENT: Record<string, string> = {
  "formulas.jsonl": formulasRaw,
  "enemies.jsonl": enemiesRaw,
  "skills.jsonl": skillsRaw,
  "items.jsonl": itemsRaw,
  "growth.jsonl": growthRaw,
  "status_effects.jsonl": statusEffectsRaw,
};

function getRawContent(filename: string): string {
  const raw = RAW_CONTENT[filename];
  if (raw == null) {
    throw new Error(`Content file not found: ${filename}`);
  }
  return raw;
}

// ── Lazy-initialized caches ──

let _skills: Map<string, ResolvedSkillContent> | null = null;
let _enemies: Map<string, ResolvedEnemyContent> | null = null;
let _items: Map<string, ItemContent> | null = null;
let _growth: Map<string, GrowthContent> | null = null;
let _statusEffects: Map<string, StatusEffectContent> | null = null;
let _formulaParams: FormulaParams | null = null;

function loadSkills(): Map<string, ResolvedSkillContent> {
  if (_skills != null) return _skills;
  const raw = parseJsonl(getRawContent("skills.jsonl"), skillContentSchema, "skills.jsonl");
  _skills = new Map();
  for (const skill of raw) {
    _skills.set(skill.id, {
      ...skill,
      element: resolveElement(skill.element),
    });
  }
  return _skills;
}

function loadEnemies(): Map<string, ResolvedEnemyContent> {
  if (_enemies != null) return _enemies;
  const raw = parseJsonl(getRawContent("enemies.jsonl"), enemyContentSchema, "enemies.jsonl");
  _enemies = new Map();
  for (const enemy of raw) {
    _enemies.set(enemy.id, {
      ...enemy,
      affinities: {
        weak: elementsToMask(enemy.affinities.weak),
        resist: elementsToMask(enemy.affinities.resist),
        nullify: elementsToMask(enemy.affinities.nullify),
        reflect: elementsToMask(enemy.affinities.reflect),
        absorb: elementsToMask(enemy.affinities.absorb),
      },
    });
  }
  return _enemies;
}

function loadItems(): Map<string, ItemContent> {
  if (_items != null) return _items;
  const raw = parseJsonl(getRawContent("items.jsonl"), itemContentSchema, "items.jsonl");
  _items = new Map();
  for (const item of raw) {
    _items.set(item.id, item);
  }
  return _items;
}

function loadGrowth(): Map<string, GrowthContent> {
  if (_growth != null) return _growth;
  const raw = parseJsonl(getRawContent("growth.jsonl"), growthContentSchema, "growth.jsonl");
  _growth = new Map();
  for (const growth of raw) {
    _growth.set(growth.id, growth);
  }
  return _growth;
}

function loadStatusEffects(): Map<string, StatusEffectContent> {
  if (_statusEffects != null) return _statusEffects;
  const raw = parseJsonl(getRawContent("status_effects.jsonl"), statusEffectContentSchema, "status_effects.jsonl");
  _statusEffects = new Map();
  for (const effect of raw) {
    _statusEffects.set(effect.id, effect);
  }
  return _statusEffects;
}

function loadFormulaParams(): FormulaParams {
  if (_formulaParams != null) return _formulaParams;
  const raw = parseJsonl(getRawContent("formulas.jsonl"), formulaParamsSchema, "formulas.jsonl");
  _formulaParams = raw[0]!;
  return _formulaParams;
}

// ── Public lookup API ──

export function getSkill(id: string): ResolvedSkillContent {
  const skills = loadSkills();
  const skill = skills.get(id);
  if (skill == null) throw new Error(`Skill not found: "${id}"`);
  return skill;
}

export function getEnemy(id: string): ResolvedEnemyContent {
  const enemies = loadEnemies();
  const enemy = enemies.get(id);
  if (enemy == null) throw new Error(`Enemy not found: "${id}"`);
  return enemy;
}

export function getItem(id: string): ItemContent {
  const items = loadItems();
  const item = items.get(id);
  if (item == null) throw new Error(`Item not found: "${id}"`);
  return item;
}

export function getGrowth(id: string): GrowthContent {
  const growths = loadGrowth();
  const growth = growths.get(id);
  if (growth == null) throw new Error(`Growth table not found: "${id}"`);
  return growth;
}

export function getStatusEffect(id: string): StatusEffectContent {
  const effects = loadStatusEffects();
  const effect = effects.get(id);
  if (effect == null) throw new Error(`Status effect not found: "${id}"`);
  return effect;
}

export function getFormulaParams(): FormulaParams {
  return loadFormulaParams();
}

export function getEnemySkillIds(enemyId: string): string[] {
  const enemy = getEnemy(enemyId);
  return enemy.skills;
}

export function getAllSkillIds(): string[] {
  return Array.from(loadSkills().keys());
}

export function getAllItemIds(): string[] {
  return Array.from(loadItems().keys());
}

export function getBattleConsumableIds(): string[] {
  const items = loadItems();
  return Array.from(items.values())
    .filter((item) => item.type === "consumable" && item.usableInBattle)
    .map((item) => item.id);
}

export function getAllGrowthIds(): string[] {
  return Array.from(loadGrowth().keys());
}

export function hasEnemy(id: string): boolean {
  return loadEnemies().has(id);
}

export function hasSkill(id: string): boolean {
  return loadSkills().has(id);
}
