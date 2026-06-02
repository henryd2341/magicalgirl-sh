import { getAllSkills, getAllItems } from "@/content/contentRegistry";
import type {
  BattleActionDefinition,
  BattleActionId,
  BattleActionMenuNode,
} from "@/types/battle";
import type { ResolvedSkillContent, ItemContent } from "@/types/content";

const BATTLE_ACTION_DEFINITIONS: Record<
  BattleActionId,
  BattleActionDefinition
> = {
  attack: {
    id: "attack",
    label: "Attack",
    description: "使用基础攻击对单体敌人造成伤害。",
    selectionMode: "selective",
    allowedSides: ["enemy"],
    resolutionKind: "attack",
  },
  guard: {
    id: "guard",
    label: "Guard",
    description: "进入防御姿态，减少即将受到的伤害。",
    selectionMode: "none",
    allowedSides: [],
    resolutionKind: "guard",
  },
  pass: {
    id: "pass",
    label: "Pass",
    description: "顺延到下一位成员。",
    selectionMode: "none",
    allowedSides: [],
    resolutionKind: "pass",
  },
  swap: {
    id: "swap",
    label: "Swap",
    description: "将任意上场成员换下，并可选地换上后备成员。",
    selectionMode: "none",
    allowedSides: [],
    resolutionKind: "swap",
  },
  "basic-skill": {
    id: "basic-skill",
    label: "Skill",
    description: "施放技能。",
    selectionMode: "selective",
    allowedSides: ["enemy", "player"],
    resolutionKind: "skill",
  },
  "basic-item": {
    id: "basic-item",
    label: "Item",
    description: "使用道具。",
    selectionMode: "selective",
    allowedSides: ["player", "enemy"],
    resolutionKind: "item",
  },
};

export function getBattleActionDefinition(
  actionId: BattleActionId,
): BattleActionDefinition {
  return BATTLE_ACTION_DEFINITIONS[actionId];
}

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  physical: "物理技能",
  gun: "飞具技能",
  fire: "火系技能",
  ice: "冰系技能",
  wind: "风系技能",
  electric: "雷系技能",
  earth: "土系技能",
  light: "光系技能",
  dark: "暗系技能",
  heal: "回复技能",
  support: "辅助技能",
  ailment: "异常技能",
  almighty: "万能技能",
};

function classifySkill(skill: ResolvedSkillContent): string | null {
  const element = skill.element;
  const category = skill.category;
  switch (element) {
    case 0:
      return category;
    case 1 << 0:
      return "physical";
    case 1 << 1:
      return "gun";
    case 1 << 2:
      return "fire";
    case 1 << 3:
      return "ice";
    case 1 << 4:
      return "wind";
    case 1 << 5:
      return "electric";
    case 1 << 6:
      return "earth";
    case 1 << 7:
      return "light";
    case 1 << 8:
      return "dark";
    case 1 << 9:
      return "almighty";
    case 1 << 10:
      return "heal";
    case 1 << 11:
      return "ailment";
  }
  return null;
}

function buildSkillMenuGroups(
  skills: Map<string, ResolvedSkillContent>,
  availableSkillIds?: Set<string>,
): BattleActionMenuNode[] {
  const groups = new Map<string, ResolvedSkillContent[]>();

  for (const skill of skills.values()) {
    if (skill.category === "passive") continue;
    if (availableSkillIds && !availableSkillIds.has(skill.id)) continue;
    const group = classifySkill(skill);
    if (group == null) continue;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(skill);
  }

  const nodes: BattleActionMenuNode[] = [];
  for (const [groupName, groupSkills] of groups) {
    nodes.push({
      id: `skill-group-${groupName}`,
      kind: "group",
      label: SKILL_CATEGORY_LABELS[groupName] ?? groupName,
      description: `打开${groupName}列表。`,
      children: groupSkills.map((skill) => ({
        id: `skill-action-${skill.id}`,
        kind: "action",
        actionId: "basic-skill",
        contentId: skill.id,
        label: skill.name,
        description: skill.description,
      })),
    });
  }

  return nodes;
}

// ── Item menu groups ──

const ITEM_GROUP_LABELS: Record<string, string> = {
  heal: "回复",
  revive: "复活",
  cure: "异常回复",
  buff: "强化",
  debuff: "弱化",
  damage: "伤害",
};

function classifyItem(item: ItemContent): string | null {
  if (item.healHp != null || item.healMp != null) return "heal";
  if (item.revivePercent != null) return "revive";
  if (item.removeStatus != null && item.removeStatus.length > 0) return "cure";
  if (item.statusEffects != null && item.statusEffects.length > 0) {
    const firstEffect = item.statusEffects[0]!.effectId;
    if (firstEffect.includes("down")) return "debuff";
    return "buff";
  }
  if (item.damageFixed != null) return "damage";
  return null;
}

function buildItemMenuNodes(
  battleItems: Record<string, number>,
): BattleActionMenuNode[] {
  const allItems = getAllItems();
  const groups = new Map<string, { item: ItemContent; count: number }[]>();

  for (const [itemId, count] of Object.entries(battleItems)) {
    if (count <= 0) continue;
    const item = allItems.get(itemId);
    if (item == null) continue;
    if (item.type !== "consumable" || !item.usableInBattle) continue;
    const group = classifyItem(item);
    if (group == null) continue;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({ item, count });
  }

  if (groups.size === 0) return [];

  const nodes: BattleActionMenuNode[] = [];
  for (const [groupName, groupItems] of groups) {
    nodes.push({
      id: `item-group-${groupName}`,
      kind: "group",
      label: ITEM_GROUP_LABELS[groupName] ?? groupName,
      description: `打开${ITEM_GROUP_LABELS[groupName] ?? groupName}道具列表。`,
      children: groupItems.map(({ item, count }) => ({
        id: `item-action-${item.id}`,
        kind: "action",
        actionId: "basic-item" as BattleActionId,
        contentId: item.id,
        label: `${item.name} ×${count}`,
        description: item.description,
      })),
    });
  }
  return nodes;
}

export function createDefaultBattleCommandMenuTree(
  availableSkillIds?: Set<string>,
  battleItems?: Record<string, number>,
): BattleActionMenuNode[] {
  const skills = getAllSkills();
  const skillGroups = buildSkillMenuGroups(skills, availableSkillIds);
  const itemNodes = battleItems != null ? buildItemMenuNodes(battleItems) : null;

  const menu: BattleActionMenuNode[] = [
    {
      id: "attack-action",
      kind: "action",
      actionId: "attack",
      label: "Attack",
      description: "使用基础攻击对单体敌人造成伤害。",
    },
    ...skillGroups,
    {
      id: "guard-action",
      kind: "action",
      actionId: "guard",
      label: "Guard",
      description: "进入防御姿态，减少即将受到的伤害。",
    },
  ];

  if (itemNodes != null && itemNodes.length > 0) {
    menu.push({
      id: "item-group",
      kind: "group",
      label: "Item",
      description: "打开道具列表。",
      children: itemNodes,
    });
  }

  menu.push(
    {
      id: "pass-action",
      kind: "action",
      actionId: "pass",
      label: "Pass",
      description: "顺延到下一位成员。",
    },
    {
      id: "swap-action",
      kind: "action",
      actionId: "swap",
      label: "Swap",
      description: "将任意上场成员换下，并可选地换上后备成员。",
    },
  );

  return menu;
}

export function findBattleActionMenuNodeById(
  nodes: BattleActionMenuNode[],
  nodeId: string,
): BattleActionMenuNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    if (node.children != null) {
      const childMatch = findBattleActionMenuNodeById(node.children, nodeId);

      if (childMatch != null) {
        return childMatch;
      }
    }
  }

  return null;
}
