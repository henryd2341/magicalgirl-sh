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
    resolutionKind: "unimplemented",
  },
  pass: {
    id: "pass",
    label: "Pass",
    description: "顺延到下一位成员（当前 MVP 不可用）。",
    selectionMode: "none",
    allowedSides: [],
    resolutionKind: "unimplemented",
  },
  "basic-skill": {
    id: "basic-skill",
    label: "Basic Skill",
    description: "施放一个默认的单体技能占位动作。",
    selectionMode: "selective",
    allowedSides: ["enemy"],
    resolutionKind: "unimplemented",
  },
  "basic-item": {
    id: "basic-item",
    label: "Basic Item",
    description: "使用一个默认的单体道具占位动作。",
    selectionMode: "selective",
    allowedSides: ["player"],
    resolutionKind: "unimplemented",
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
      description: "顺延到下一位成员（当前 MVP 不可用）。",
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
