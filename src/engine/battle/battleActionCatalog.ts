import type {
  BattleActionDefinition,
  BattleActionId,
  BattleActionMenuNode,
} from "@/types/battle";
import { getAllSkills } from "@/content/contentRegistry";
import type { ResolvedSkillContent } from "@/types/content";

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
    allowedSides: ["player"],
    resolutionKind: "item",
  },
};

export function getBattleActionDefinition(
  actionId: BattleActionId,
): BattleActionDefinition {
  return BATTLE_ACTION_DEFINITIONS[actionId];
}

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  "物理·剑系": "物理·剑系",
  "物理·弓系": "物理·弓系",
  "物理·枪系": "物理·枪系",
  "火系魔法": "火系魔法",
  "冰系魔法": "冰系魔法",
  "风系魔法": "风系魔法",
  "雷系魔法": "雷系魔法",
  "土系魔法": "土系魔法",
  "光系魔法": "光系魔法",
  "暗系魔法": "暗系魔法",
  "回复魔法": "回复魔法",
  "辅助技能": "辅助技能",
  "异常技能": "异常技能",
  "护盾技能": "护盾技能",
  "万能魔法": "万能魔法",
  "专属技能": "专属技能",
};

function classifySkill(skill: ResolvedSkillContent): string | null {
  const id = parseInt(skill.id, 10);
  if (isNaN(id)) return null;
  if (id >= 1 && id <= 18) return "物理·剑系";
  if (id >= 19 && id <= 28) return "物理·弓系";
  if (id >= 29 && id <= 36) return "物理·枪系";
  if (id >= 37 && id <= 43) return "火系魔法";
  if (id >= 44 && id <= 50) return "冰系魔法";
  if (id >= 51 && id <= 57) return "风系魔法";
  if (id >= 58 && id <= 64) return "雷系魔法";
  if (id >= 65 && id <= 71) return "土系魔法";
  if (id >= 72 && id <= 78) return "光系魔法";
  if (id >= 79 && id <= 85) return "暗系魔法";
  if (id >= 86 && id <= 91) return "回复魔法";
  if (id >= 92 && id <= 105) return "辅助技能";
  if (id >= 106 && id <= 112) return "异常技能";
  if (id >= 113 && id <= 132) return "护盾技能";
  if (id >= 181 && id <= 186) return "万能魔法";
  if (id >= 165 && id <= 187) return "专属技能";
  return null;
}

function buildSkillMenuGroups(
  skills: Map<string, ResolvedSkillContent>,
): BattleActionMenuNode[] {
  const groups = new Map<string, ResolvedSkillContent[]>();

  for (const skill of skills.values()) {
    if (skill.category === "passive") continue;
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

export function createDefaultBattleCommandMenuTree(): BattleActionMenuNode[] {
  const skills = getAllSkills();
  const skillGroups = buildSkillMenuGroups(skills);

  return [
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
    {
      id: "item-group",
      kind: "group",
      label: "Item",
      description: "打开道具列表。",
      children: [
        {
          id: "basic-item-action",
          kind: "action",
          actionId: "basic-item",
          label: "Basic Item",
          description: "使用一个默认的单体道具占位动作。",
        },
      ],
    },
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
  ];
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
