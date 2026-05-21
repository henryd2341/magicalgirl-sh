import { resolveSelectedBattleAction } from "@/engine/battle/battleResolver";
import type { BattleSnapshot } from "@/types/battle";
import { describe, expect, it } from "vitest";

function createActiveBattleSnapshot(
  overrides: Partial<BattleSnapshot> = {},
): BattleSnapshot {
  return {
    lifecycleState: "ACTIVE",
    phase: "PLAYER_COMMAND",
    encounterId: "enc-battle-resolver-001",
    participants: [
      {
        id: "player-heroine-1",
        side: "player",
        displayName: "鹿目真昼",
        level: 1,
        hp: {
          current: 120,
          max: 120,
        },
        mp: {
          current: 48,
          max: 48,
        },
        isDown: false,
        statusEffects: [],
      },
      {
        id: "enemy-1",
        side: "enemy",
        displayName: "first-shadow",
        level: 1,
        hp: {
          current: 2,
          max: 2,
        },
        mp: {
          current: 0,
          max: 0,
        },
        isDown: false,
        statusEffects: [],
      },
      {
        id: "enemy-2",
        side: "enemy",
        displayName: "second-shadow",
        level: 1,
        hp: {
          current: 2,
          max: 2,
        },
        mp: {
          current: 0,
          max: 0,
        },
        isDown: false,
        statusEffects: [],
      },
    ],
    pressTurn: {
      totalIcons: 1,
      spentIcons: 0,
    },
    turnCount: 1,
    selectedTargetId: "enemy-1",
    currentActorId: "player-heroine-1",
    selectedActionId: "attack",
    actionMenu: [
      {
        id: "attack",
        label: "Attack",
        description: "使用基础攻击对单体敌人造成伤害。",
      },
      {
        id: "skill",
        label: "Skill",
        description: "施放角色技能并消耗对应资源。",
      },
    ],
    ...overrides,
  };
}

describe("battleResolver", () => {
  it("resolves a selected attack by dealing 1 damage, spending 1 press turn icon, and advancing to ENEMY_TURN only after icons are exhausted", () => {
    const snapshot = createActiveBattleSnapshot();

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual({
      lifecycleState: "ACTIVE",
      phase: "ENEMY_TURN",
      encounterId: "enc-battle-resolver-001",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: {
            current: 120,
            max: 120,
          },
          mp: {
            current: 48,
            max: 48,
          },
          isDown: false,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: {
            current: 1,
            max: 2,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: false,
          statusEffects: [],
        },
        {
          id: "enemy-2",
          side: "enemy",
          displayName: "second-shadow",
          level: 1,
          hp: {
            current: 2,
            max: 2,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: false,
          statusEffects: [],
        },
      ],
      pressTurn: {
        totalIcons: 1,
        spentIcons: 1,
      },
      turnCount: 1,
      selectedTargetId: "enemy-1",
      currentActorId: "player-heroine-1",
      selectedActionId: "attack",
      actionMenu: [
        {
          id: "attack",
          label: "Attack",
          description: "使用基础攻击对单体敌人造成伤害。",
        },
        {
          id: "skill",
          label: "Skill",
          description: "施放角色技能并消耗对应资源。",
        },
      ],
    });
  });

  it("keeps the battle in PLAYER_COMMAND when press turn icons remain after the attack", () => {
    const snapshot = createActiveBattleSnapshot({
      pressTurn: {
        totalIcons: 2,
        spentIcons: 0,
      },
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.phase).toBe("PLAYER_COMMAND");
    expect(resolved.lifecycleState).toBe("ACTIVE");
    expect(resolved.pressTurn).toEqual({
      totalIcons: 2,
      spentIcons: 1,
    });
    expect(
      resolved.participants.find((participant) => participant.id === "enemy-1"),
    ).toMatchObject({
      hp: {
        current: 1,
        max: 2,
      },
      isDown: false,
    });
  });

  it("does not mutate battle state when the current phase is not PLAYER_COMMAND", () => {
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN",
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual(snapshot);
  });

  it("does not mutate battle state when the selected action is not attack", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "skill",
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual(snapshot);
  });

  it("does not mutate battle state when no selected target is present", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedTargetId: null,
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual(snapshot);
  });

  it("does not mutate battle state when the selected target cannot be found", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedTargetId: "enemy-999",
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual(snapshot);
  });

  it("does not mutate battle state when the selected target is not an enemy", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedTargetId: "player-heroine-1",
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual(snapshot);
  });

  it("does not mutate battle state when the selected target is already down", () => {
    const snapshot = createActiveBattleSnapshot({
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: {
            current: 120,
            max: 120,
          },
          mp: {
            current: 48,
            max: 48,
          },
          isDown: false,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "fallen-shadow",
          level: 1,
          hp: {
            current: 0,
            max: 2,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: true,
          statusEffects: [],
        },
      ],
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual(snapshot);
  });

  it("marks the target down and resolves the battle into RESULT when the final enemy is defeated", () => {
    const snapshot = createActiveBattleSnapshot({
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: {
            current: 120,
            max: 120,
          },
          mp: {
            current: 48,
            max: 48,
          },
          isDown: false,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "last-shadow",
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
          statusEffects: [],
        },
      ],
      selectedTargetId: "enemy-1",
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual({
      lifecycleState: "RESOLVED",
      phase: "RESULT",
      encounterId: "enc-battle-resolver-001",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: {
            current: 120,
            max: 120,
          },
          mp: {
            current: 48,
            max: 48,
          },
          isDown: false,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "last-shadow",
          level: 1,
          hp: {
            current: 0,
            max: 1,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: true,
          statusEffects: [],
        },
      ],
      pressTurn: {
        totalIcons: 1,
        spentIcons: 1,
      },
      turnCount: 1,
      selectedTargetId: "enemy-1",
      currentActorId: "player-heroine-1",
      selectedActionId: "attack",
      actionMenu: [
        {
          id: "attack",
          label: "Attack",
          description: "使用基础攻击对单体敌人造成伤害。",
        },
        {
          id: "skill",
          label: "Skill",
          description: "施放角色技能并消耗对应资源。",
        },
      ],
      resultSummary: "Victory",
    });
  });
});
