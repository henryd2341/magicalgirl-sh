import {
  createDefaultBattleCommandMenuTree,
  getBattleActionDefinition,
} from "@/engine/battle/battleActionCatalog";
import type { TriggerBattleToolInput } from "@/orchestrator/toolEnvelope";
import {
  createBattleSnapshotFromPendingBattle,
  createPendingBattleSnapshot,
  expandTriggerBattleEnemies,
} from "@/engine/battle/battleSetup";
import {
  BATTLE_LIFECYCLE_STATES,
  BATTLE_PHASES,
  BATTLE_RESULT_END_REASONS,
  BATTLE_RESULT_OUTCOMES,
  BATTLE_ELEMENTS as BattleElement,
  COMBATANT_SIDES,
  type BattleActionOutcome,
  type BattleActionResolution,
  type BattleResult,
  type PressTurnSettlementResult,
} from "@/types/battle";
import { describe, expect, it } from "vitest";

describe("battle types", () => {
  it("defines the MVP battle lifecycle, phase, side unions, and battle result enums for the domain layer", () => {
    expect(BATTLE_LIFECYCLE_STATES).toEqual(["PENDING", "ACTIVE", "RESOLVED"]);
    expect(BATTLE_PHASES).toEqual([
      "PLAYER_COMMAND",
      "PLAYER_RESOLUTION",
      "ENEMY_TURN",
      "RESULT",
    ]);
    expect(COMBATANT_SIDES).toEqual(["player", "enemy"]);
    expect(BATTLE_RESULT_OUTCOMES).toEqual(["victory", "defeat", "escape"]);
    expect(BATTLE_RESULT_END_REASONS).toEqual([
      "all_enemies_down",
      "all_players_down",
      "manual_exit",
    ]);
  });

  it("defines BattleElement as bitmask flags including earth before light", () => {
    expect(BattleElement.Physical).toBe(1 << 0);
    expect(BattleElement.Gun).toBe(1 << 1);
    expect(BattleElement.Wind).toBe(1 << 5);
    expect(BattleElement.Earth).toBe(1 << 6);
    expect(BattleElement.Light).toBe(1 << 7);
    expect(BattleElement.Dark).toBe(1 << 8);
    expect(BattleElement.Almighty).toBe(1 << 9);
    expect(BattleElement.Heal).toBe(1 << 10);
    expect(BattleElement.Ailment).toBe(1 << 11);
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

  it("defaults player and enemy participants to isActive true when starting a battle snapshot", () => {
    const pendingBattle = createPendingBattleSnapshot({
      encounterId: "enc-battle-types-active-001",
      narrativeReason: "默认上场状态测试。",
      enemies: [{ enemy_id: "default-active-shadow", count: 1 }],
    });

    const snapshot = createBattleSnapshotFromPendingBattle({
      pendingBattle,
      playerParty: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
        },
      ],
    });

    expect(snapshot.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "player-heroine-1",
          side: "player",
          isActive: true,
        }),
        expect.objectContaining({
          id: "enemy-1",
          side: "enemy",
          isActive: true,
        }),
      ]),
    );
    expect(snapshot.battleResult).toBeUndefined();
  });

  it("models BattleResult as a battle-end snapshot separate from future settlement data", () => {
    const battleResult: BattleResult = {
      outcome: "victory",
      winningSide: "player",
      endReason: "all_enemies_down",
      turnCount: 3,
      survivingParticipantIds: ["player-heroine-1", "player-heroine-2"],
      downParticipantIds: ["enemy-1", "enemy-2"],
    };

    expect(battleResult).toEqual({
      outcome: "victory",
      winningSide: "player",
      endReason: "all_enemies_down",
      turnCount: 3,
      survivingParticipantIds: ["player-heroine-1", "player-heroine-2"],
      downParticipantIds: ["enemy-1", "enemy-2"],
    });
  });

  it("creates the default battle command tree with root-level action and group nodes", () => {
    const commandTree = createDefaultBattleCommandMenuTree();

    expect(commandTree.length).toBeGreaterThanOrEqual(5);

    const findNode = (id: string) => commandTree.find((n) => n.id === id);
    expect(findNode("attack-action")).toEqual(expect.objectContaining({ kind: "action", actionId: "attack" }));
    expect(findNode("guard-action")).toEqual(expect.objectContaining({ kind: "action", actionId: "guard" }));
    expect(findNode("pass-action")).toEqual(expect.objectContaining({ kind: "action", actionId: "pass" }));
    expect(findNode("swap-action")).toEqual(expect.objectContaining({ kind: "action", actionId: "swap" }));

    const skillGroups = commandTree.filter((n) => n.kind === "group" && n.id.startsWith("skill-group-"));
    expect(skillGroups.length).toBeGreaterThanOrEqual(1);
    for (const sg of skillGroups) {
      expect(sg.children?.length).toBeGreaterThan(0);
      expect(sg.children?.every((c) => c.kind === "action" && c.actionId === "basic-skill")).toBe(true);
    }
  });

  it("creates skill and item group nodes with leaf action children", () => {
    const commandTree = createDefaultBattleCommandMenuTree();

    const skillGroup = commandTree.find((node) => node.id.startsWith("skill-group-"));

    expect(skillGroup).toEqual(
      expect.objectContaining({
        kind: "group",
        children: expect.any(Array),
      }),
    );

    expect(skillGroup?.children?.length).toBeGreaterThan(0);

    expect(skillGroup?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action",
          actionId: "basic-skill",
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
        resolutionKind: "guard",
      }),
    );

    expect(getBattleActionDefinition("pass")).toEqual(
      expect.objectContaining({
        id: "pass",
        label: "Pass",
        selectionMode: "none",
        allowedSides: [],
        resolutionKind: "pass",
      }),
    );

    expect(getBattleActionDefinition("basic-skill")).toEqual(
      expect.objectContaining({
        id: "basic-skill",
        label: "Skill",
        selectionMode: "selective",
        allowedSides: ["enemy", "player"],
        resolutionKind: "skill",
      }),
    );

    expect(getBattleActionDefinition("basic-item")).toEqual(
      expect.objectContaining({
        id: "basic-item",
        label: "Item",
        selectionMode: "selective",
        allowedSides: ["player", "enemy"],
        resolutionKind: "item",
      }),
    );
  });

  it("keeps target selection rules on executable leaf action definitions instead of group menu nodes", () => {
    const commandTree = createDefaultBattleCommandMenuTree();
    const skillGroup = commandTree.find((node) => node.id.startsWith("skill-group-"));

    expect(skillGroup).toBeDefined();
    expect(skillGroup).toEqual(
      expect.not.objectContaining({
        actionId: expect.anything(),
        allowedSides: expect.anything(),
        selectionMode: expect.anything(),
        resolutionKind: expect.anything(),
      }),
    );
  });

  it("models battle resolutions as snapshots of validation, outcomes, and press-turn settlement", () => {
    const outcome: BattleActionOutcome = {
      type: "hit",
      tags: ["critical"],
      actorId: "player-heroine-1",
      primaryTargetId: "enemy-1",
      finalTargetId: "enemy-1",
      hpDelta: -18,
      appliedStatusEffects: [{ effectId: "shock", duration: 3 }],
    };

    const pressTurnResult: PressTurnSettlementResult = {
      kind: "reward_half_turn",
      reason: "critical",
      before: {
        ownerSide: "player",
        icons: [{ id: "pt-player-1", state: "solid" }],
      },
      after: {
        ownerSide: "player",
        icons: [{ id: "pt-player-1", state: "blinking" }],
      },
    };

    const resolution: BattleActionResolution = {
      ok: true,
      actorId: "player-heroine-1",
      actionId: "attack",
      intendedTargetId: "enemy-1",
      outcomes: [outcome],
      pressTurnResult,
      verboseLog: ["鹿目真昼 使用了 Attack，对 enemy-1 造成了暴击。"],
      summaryLog: ["暴击命中"],
    };

    expect(resolution.ok).toBe(true);
    expect(resolution.outcomes).toEqual([outcome]);
    expect(resolution.pressTurnResult).toEqual(pressTurnResult);
    expect(resolution.summaryLog).toContain("暴击命中");
  });

  it("models validation failures as no-op battle resolutions with explicit error codes", () => {
    const failedResolution: BattleActionResolution = {
      ok: false,
      validationError: "target_required",
      actorId: "player-heroine-1",
      actionId: "attack",
      intendedTargetId: null,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };

    expect(failedResolution).toEqual({
      ok: false,
      validationError: "target_required",
      actorId: "player-heroine-1",
      actionId: "attack",
      intendedTargetId: null,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    });
  });
});
