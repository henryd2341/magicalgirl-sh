import type {
  BattleActionDefinition,
  BattleActionId,
  BattleActionMenuNode,
} from "@/types/battle";

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

export function createDefaultBattleCommandMenuTree(): BattleActionMenuNode[] {
  return [
    {
      id: "attack-action",
      kind: "action",
      actionId: "attack",
      label: "Attack",
      description: "使用基础攻击对单体敌人造成伤害。",
    },
    {
      id: "skill-group",
      kind: "group",
      label: "Skill",
      description: "打开技能列表。",
      children: [
        {
          id: "basic-skill-action",
          kind: "action",
          actionId: "basic-skill",
          label: "Basic Skill",
          description: "施放一个默认的单体技能占位动作。",
        },
      ],
    },
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
