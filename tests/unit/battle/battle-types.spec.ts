import {
  createDefaultBattleCommandMenuTree,
  getBattleActionDefinition,
} from "@/engine/battle/battleActionCatalog";
import type { TriggerBattleToolInput } from "@/orchestrator/toolEnvelope";
import {
  BATTLE_LIFECYCLE_STATES,
  BATTLE_PHASES,
  COMBATANT_SIDES,
  createBattleSnapshotFromPendingBattle,
  createPendingBattleSnapshot,
  expandTriggerBattleEnemies,
} from "@/types/battle";
import { describe, expect, it } from "vitest";

describe("battle types", () => {
  it("defines the MVP battle lifecycle, phase, and side unions for the domain layer", () => {
    expect(BATTLE_LIFECYCLE_STATES).toEqual(["PENDING", "ACTIVE", "RESOLVED"]);
    expect(BATTLE_PHASES).toEqual([
      "PLAYER_COMMAND",
      "PLAYER_RESOLUTION",
      "ENEMY_TURN",
      "RESULT",
    ]);
    expect(COMBATANT_SIDES).toEqual(["player", "enemy"]);
  });

  it("expands trigger_battle tool enemy groups into runtime battle enemy instances", () => {
    const input: TriggerBattleToolInput = {
      encounter_id: "enc-battle-types-001",
      enemies: [
        {
          enemy_id: "shadow-graffiti",
          count: 2,
        },
        {
          enemy_id: "stairwell-wisp",
          count: 1,
        },
      ],
      narrative_reason: "楼梯间和镜面后的影子同时苏醒。",
    };

    const expanded = expandTriggerBattleEnemies(input.enemies);

    expect(expanded).toEqual([
      {
        instanceId: "enemy-1",
        enemyId: "shadow-graffiti",
        displayName: "shadow-graffiti",
        side: "enemy",
      },
      {
        instanceId: "enemy-2",
        enemyId: "shadow-graffiti",
        displayName: "shadow-graffiti",
        side: "enemy",
      },
      {
        instanceId: "enemy-3",
        enemyId: "stairwell-wisp",
        displayName: "stairwell-wisp",
        side: "enemy",
      },
    ]);
  });

  it("creates a pending battle snapshot with expanded runtime enemies", () => {
    const snapshot = createPendingBattleSnapshot({
      encounterId: "enc-battle-types-002",
      narrativeReason: "自动售货机的玻璃里倒映出了第二双眼睛。",
      enemies: [
        {
          enemy_id: "vending-shadow",
          count: 2,
        },
      ],
    });

    expect(snapshot).toEqual({
      encounterId: "enc-battle-types-002",
      narrativeReason: "自动售货机的玻璃里倒映出了第二双眼睛。",
      enemies: [
        {
          instanceId: "enemy-1",
          enemyId: "vending-shadow",
          displayName: "vending-shadow",
          side: "enemy",
        },
        {
          instanceId: "enemy-2",
          enemyId: "vending-shadow",
          displayName: "vending-shadow",
          side: "enemy",
        },
      ],
      lifecycleState: "PENDING",
    });
  });

  it("creates the default battle command tree with root-level action and group nodes", () => {
    const commandTree = createDefaultBattleCommandMenuTree();

    expect(commandTree).toHaveLength(5);
    expect(commandTree).toEqual([
      expect.objectContaining({
        id: "attack-action",
        kind: "action",
        actionId: "attack",
        label: "Attack",
      }),
      expect.objectContaining({
        id: "skill-group",
        kind: "group",
        label: "Skill",
      }),
      expect.objectContaining({
        id: "guard-action",
        kind: "action",
        actionId: "guard",
        label: "Guard",
      }),
      expect.objectContaining({
        id: "item-group",
        kind: "group",
        label: "Item",
      }),
      expect.objectContaining({
        id: "pass-action",
        kind: "action",
        actionId: "pass",
        label: "Pass",
      }),
    ]);
  });

  it("creates skill and item group nodes with leaf action children", () => {
    const commandTree = createDefaultBattleCommandMenuTree();

    const skillGroup = commandTree.find((node) => node.id === "skill-group");
    const itemGroup = commandTree.find((node) => node.id === "item-group");

    expect(skillGroup).toEqual(
      expect.objectContaining({
        id: "skill-group",
        kind: "group",
        label: "Skill",
        children: expect.any(Array),
      }),
    );
    expect(itemGroup).toEqual(
      expect.objectContaining({
        id: "item-group",
        kind: "group",
        label: "Item",
        children: expect.any(Array),
      }),
    );

    expect(skillGroup?.children?.length).toBeGreaterThan(0);
    expect(itemGroup?.children?.length).toBeGreaterThan(0);

    expect(skillGroup?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action",
          actionId: "basic-skill",
        }),
      ]),
    );
    expect(itemGroup?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action",
          actionId: "basic-item",
        }),
      ]),
    );
  });

  it("defines leaf battle actions through the battle action catalog", () => {
    expect(getBattleActionDefinition("attack")).toEqual(
      expect.objectContaining({
        id: "attack",
        label: "Attack",
        selectionMode: "selective",
        allowedSides: ["enemy"],
        resolutionKind: "attack",
      }),
    );

    expect(getBattleActionDefinition("guard")).toEqual(
      expect.objectContaining({
        id: "guard",
        label: "Guard",
        selectionMode: "none",
        allowedSides: [],
        resolutionKind: "unimplemented",
      }),
    );

    expect(getBattleActionDefinition("pass")).toEqual(
      expect.objectContaining({
        id: "pass",
        label: "Pass",
        selectionMode: "none",
        allowedSides: [],
        resolutionKind: "unimplemented",
      }),
    );

    expect(getBattleActionDefinition("basic-skill")).toEqual(
      expect.objectContaining({
        id: "basic-skill",
        label: "Basic Skill",
        selectionMode: "selective",
        allowedSides: ["enemy"],
        resolutionKind: "unimplemented",
      }),
    );

    expect(getBattleActionDefinition("basic-item")).toEqual(
      expect.objectContaining({
        id: "basic-item",
        label: "Basic Item",
        selectionMode: "selective",
        allowedSides: ["player"],
        resolutionKind: "unimplemented",
      }),
    );
  });

  it("keeps target selection rules on executable leaf action definitions instead of group menu nodes", () => {
    const commandTree = createDefaultBattleCommandMenuTree();
    const skillGroup = commandTree.find((node) => node.id === "skill-group");

    expect(skillGroup).toBeDefined();
    expect(skillGroup).toEqual(
      expect.not.objectContaining({
        actionId: expect.anything(),
        allowedSides: expect.anything(),
        selectionMode: expect.anything(),
        resolutionKind: expect.anything(),
      }),
    );

    expect(getBattleActionDefinition("basic-skill")).toEqual(
      expect.objectContaining({
        allowedSides: ["enemy"],
        selectionMode: "selective",
      }),
    );
  });

  it("creates an active battle snapshot with the root battle command tree and no selected executable action by default", () => {
    const pendingBattle = createPendingBattleSnapshot({
      encounterId: "enc-battle-types-tree-001",
      narrativeReason: "测试树形战斗命令菜单初始化。",
      enemies: [{ enemy_id: "tree-shadow", count: 2 }],
    });

    const snapshot = createBattleSnapshotFromPendingBattle({
      pendingBattle,
      playerParty: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          hp: {
            current: 120,
            max: 120,
          },
          mp: {
            current: 48,
            max: 48,
          },
          isDown: false,
        },
      ],
    });

    expect(snapshot.currentMenuNodeId).toBeNull();
    expect(snapshot.selectedActionId).toBeNull();
    expect(snapshot.selectedTargetId).toBe("enemy-1");
    expect(snapshot.actionMenu).toEqual(createDefaultBattleCommandMenuTree());
  });
});
