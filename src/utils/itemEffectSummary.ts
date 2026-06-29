import type { ItemContent, ItemAccessoryEffect } from "@/types/content";
import { getStatusEffect } from "@/content/contentRegistry";

const ELEMENT_NAMES: Record<string, string> = {
  Fire: "火",
  Ice: "水",
  Wind: "风",
  Electric: "雷",
  Earth: "土",
  Light: "光",
  Dark: "暗",
  Physical: "物理",
  Ailment: "异常",
};

const RESIST_TYPE_NAMES: Record<string, string> = {
  resist: "耐性",
  nullify: "无效",
  reflect: "反弹",
  absorb: "吸收",
};

const ACCESSORY_EFFECT_DESCRIPTIONS: Record<ItemAccessoryEffect, string> = {
  auto_buff_start: "战斗开始时自动获得攻击力·防御力·敏捷提升（3回合）",
  no_press_penalty: "Miss/无效/反弹/吸收只消耗1个Press Turn图标",
  pass_free: "Pass行动不消耗Press Turn图标",
  miss_consume_all: "敌方攻击被Miss/无效时消耗敌方全部Press Turn图标",
};

const STAT_NAMES: Record<string, string> = {
  attack: "攻击力",
  defense: "防御力",
  agility: "敏捷",
  intelligence: "魔力",
};

const FULL_RESTORE_SENTINEL = 9999;

function getStatusEffectName(effectId: string): string {
  try {
    const effect = getStatusEffect(effectId);
    return effect.name;
  } catch {
    return effectId;
  }
}

export function summarizeItemEffects(item: ItemContent): string[] {
  const effects: string[] = [];

  if (item.type === "consumable") {
    if (item.healHp != null) {
      if (item.healHp >= FULL_RESTORE_SENTINEL) {
        effects.push("回复全部 HP");
      } else {
        effects.push(`回复 ${item.healHp} HP`);
      }
    }

    if (item.healMp != null) {
      if (item.healMp >= FULL_RESTORE_SENTINEL) {
        effects.push("回复全部 MP");
      } else {
        effects.push(`回复 ${item.healMp} MP`);
      }
    }

    if (item.revivePercent != null) {
      effects.push(`复活并回复 ${item.revivePercent}% HP`);
    }

    if (item.removeStatus?.length) {
      const statusNames = item.removeStatus.map(getStatusEffectName);
      effects.push(`解除 ${statusNames.join("、")}`);
    }

    if (item.damageFixed != null) {
      const elementName = item.element
        ? (ELEMENT_NAMES[item.element] ?? item.element)
        : "物理";
      effects.push(`${elementName}属性伤害 ${item.damageFixed}`);
    }

    if (item.statusEffects?.length) {
      for (const effect of item.statusEffects) {
        const name = getStatusEffectName(effect.effectId);
        effects.push(`${name}（3回合）`);
      }
    }
  } else if (item.type === "accessory") {
    if (item.modifiers) {
      const statEntries = Object.entries(item.modifiers);
      for (const [stat, value] of statEntries) {
        const statName = STAT_NAMES[stat] ?? stat;
        effects.push(`${statName} +${value}`);
      }
    }

    if (item.accessoryEffects?.length) {
      for (const effect of item.accessoryEffects) {
        effects.push(
          ACCESSORY_EFFECT_DESCRIPTIONS[effect] ?? effect,
        );
      }
    }

    if (item.affinityResist) {
      for (const [element, resistType] of Object.entries(item.affinityResist)) {
        if (resistType == null) continue;
        const elementName = ELEMENT_NAMES[element] ?? element;
        const resistName = RESIST_TYPE_NAMES[resistType] ?? resistType;
        effects.push(`${elementName}属性${resistName}`);
      }
    }
  }

  if (effects.length === 0) {
    effects.push("无主动效果");
  }

  return effects;
}
