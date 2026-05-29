import { createDefaultBattleCommandMenuTree } from "@/engine/battle/battleActionCatalog";
import {
  createPressTurnResolutionForOutcomes,
  resolveEnemyTurn,
  resolveSelectedBattleAction,
  resolveSelectedBattleActionToResolution,
} from "@/engine/battle/battleResolver";
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
        attack: 5,
        defense: 5,
        agility: 5,
        intelligence: 5,
        isDown: false,
        isActive: true,
        statusEffects: [],
      },
      {
        id: "enemy-1",
        side: "enemy",
        displayName: "first-shadow",
        level: 1,
        hp: {
          current: 20,
          max: 20,
        },
        mp: {
          current: 0,
          max: 0,
        },
        attack: 5,
        defense: 5,
        agility: 5,
        intelligence: 5,
        isDown: false,
        isActive: true,
        statusEffects: [],
      },
      {
        id: "enemy-2",
        side: "enemy",
        displayName: "second-shadow",
        level: 1,
        hp: {
          current: 20,
          max: 20,
        },
        mp: {
          current: 0,
          max: 0,
        },
        attack: 5,
        defense: 5,
        agility: 5,
        intelligence: 5,
        isDown: false,
        isActive: true,
        statusEffects: [],
      },
    ],
    pressTurn: {
      ownerSide: "player",
      icons: [{ id: "pt-player-player-heroine-1-1", state: "solid" }],
    },
    pressTurnAllocation: {
      participantIds: ["player-heroine-1"],
      initialIconCount: 1,
    },
    turnCount: 1,
    selectedTargetId: "enemy-1",
    currentActorId: "player-heroine-1",
    currentMenuNodeId: null,
    selectedActionId: "attack",
    actionMenu: createDefaultBattleCommandMenuTree(),
    ...overrides,
  };
}

describe("battleResolver", () => {
  it("resolves attack through its definition-driven resolution kind", () => {
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
          isActive: true,
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
          isActive: true,
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
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurn: {
        ownerSide: "player",
        icons: [],
      },
      pressTurnAllocation: {
        participantIds: ["player-heroine-1"],
        initialIconCount: 1,
      },
      turnCount: 1,
      selectedTargetId: "enemy-1",
      currentActorId: null,
      currentMenuNodeId: null,
      selectedActionId: "attack",
      actionMenu: createDefaultBattleCommandMenuTree(),
      battleLog: [
        {
          id: "turn-1-player-heroine-1-attack-enemy-1",
          turnCount: 1,
          side: "player",
          actorId: "player-heroine-1",
          actionId: "attack",
          targetId: "enemy-1",
          summary: "Attack hit",
        },
      ],
    });
  });

  it("produces a formal battleResult when the battle enters RESULT after all enemies are down", () => {
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
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
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
          isActive: true,
          statusEffects: [],
        },
      ],
      selectedTargetId: "enemy-1",
      turnCount: 3,
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.lifecycleState).toBe("RESOLVED");
    expect(resolved.phase).toBe("RESULT");
    expect(resolved.resultSummary).toBe("Victory");
    expect(resolved.battleResult).toEqual({
      outcome: "victory",
      winningSide: "player",
      endReason: "all_enemies_down",
      turnCount: 3,
      survivingParticipantIds: ["player-heroine-1"],
      downParticipantIds: ["enemy-1"],
    });
  });

  it("produces a formal defeat battleResult when all players are already down at resolution time", () => {
    const snapshot = createActiveBattleSnapshot({
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: {
            current: 0,
            max: 120,
          },
          mp: {
            current: 48,
            max: 48,
          },
          isDown: true,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
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
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurn: {
        ownerSide: "player",
        icons: [],
      },
      selectedActionId: "pass",
      turnCount: 4,
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.lifecycleState).toBe("RESOLVED");
    expect(resolved.phase).toBe("RESULT");
    expect(resolved.resultSummary).toBe("Defeat");
    expect(resolved.battleResult).toEqual({
      outcome: "defeat",
      winningSide: "enemy",
      endReason: "all_players_down",
      turnCount: 4,
      survivingParticipantIds: ["enemy-1"],
      downParticipantIds: ["player-heroine-1"],
    });
  });

  it("resolves the enemy turn deterministically and starts the next player round when players survive", () => {
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN",
      currentActorId: null,
      selectedActionId: null,
      selectedTargetId: null,
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 2, max: 2 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurn: {
        ownerSide: "enemy",
        icons: [{ id: "pt-enemy-enemy-1-1", state: "solid" }],
      },
      pressTurnAllocation: {
        participantIds: ["enemy-1"],
        initialIconCount: 1,
      },
      turnCount: 1,
    });

    const resolved = resolveEnemyTurn(snapshot);

    expect(resolved.phase).toBe("PLAYER_COMMAND");
    expect(resolved.lifecycleState).toBe("ACTIVE");
    expect(resolved.turnCount).toBe(2);
    expect(resolved.currentActorId).toBe("player-heroine-1");
    expect(resolved.selectedActionId).toBeNull();
    expect(resolved.selectedTargetId).toBe("enemy-1");
    expect(resolved.pressTurn).toEqual({
      ownerSide: "player",
      icons: [{ id: "pt-player-player-heroine-1-1", state: "solid" }],
    });
    expect(
      resolved.participants.find(
        (participant) => participant.id === "player-heroine-1",
      ),
    ).toMatchObject({
      hp: { current: 1, max: 2 },
      isDown: false,
    });
    expect(resolved.battleLog).toEqual([
      {
        id: "turn-1-enemy-1-attack-player-heroine-1",
        turnCount: 1,
        side: "enemy",
        actorId: "enemy-1",
        actionId: "enemy_attack",
        targetId: "player-heroine-1",
        summary: "first-shadow attacked 鹿目真昼 for 1 damage.",
      },
      {
        id: "turn-2-player-round-start",
        turnCount: 2,
        side: "system",
        summary: "Player turn 2 started.",
      },
    ]);
  });

  it("reduces enemy attack damage against a guarding player and clears guard before the next player round", () => {
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN",
      currentActorId: null,
      selectedActionId: null,
      selectedTargetId: null,
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 1, max: 2 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: ["guarding"],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurn: {
        ownerSide: "enemy",
        icons: [{ id: "pt-enemy-enemy-1-1", state: "solid" }],
      },
      pressTurnAllocation: {
        participantIds: ["enemy-1"],
        initialIconCount: 1,
      },
      turnCount: 1,
    });

    const resolved = resolveEnemyTurn(snapshot);

    expect(resolved.phase).toBe("PLAYER_COMMAND");
    expect(
      resolved.participants.find(
        (participant) => participant.id === "player-heroine-1",
      ),
    ).toMatchObject({
      hp: { current: 1, max: 2 },
      isDown: false,
      statusEffects: [],
    });
    expect(resolved.battleLog).toEqual([
      {
        id: "turn-1-enemy-1-attack-player-heroine-1",
        turnCount: 1,
        side: "enemy",
        actorId: "enemy-1",
        actionId: "enemy_attack",
        targetId: "player-heroine-1",
        summary: "first-shadow attacked 鹿目真昼 for 0 damage.",
      },
      {
        id: "turn-2-player-round-start",
        turnCount: 2,
        side: "system",
        summary: "Player turn 2 started.",
      },
    ]);
  });

  it("resolves defeat during enemy turn when the final active player is down", () => {
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN",
      currentActorId: null,
      selectedActionId: null,
      selectedTargetId: null,
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 1, max: 1 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurn: {
        ownerSide: "enemy",
        icons: [{ id: "pt-enemy-enemy-1-1", state: "solid" }],
      },
      pressTurnAllocation: {
        participantIds: ["enemy-1"],
        initialIconCount: 1,
      },
      turnCount: 2,
    });

    const resolved = resolveEnemyTurn(snapshot);

    expect(resolved.lifecycleState).toBe("RESOLVED");
    expect(resolved.phase).toBe("RESULT");
    expect(resolved.resultSummary).toBe("Defeat");
    expect(resolved.battleResult).toEqual({
      outcome: "defeat",
      winningSide: "enemy",
      endReason: "all_players_down",
      turnCount: 2,
      survivingParticipantIds: ["enemy-1"],
      downParticipantIds: ["player-heroine-1"],
    });
    expect(resolved.battleLog?.at(-1)).toEqual({
      id: "turn-2-result-defeat",
      turnCount: 2,
      side: "system",
      summary: "Defeat: all players are down.",
    });
  });

  it("targets the lowest-HP active player during enemy turn and retargets after a player goes down", () => {
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN",
      currentActorId: null,
      selectedActionId: null,
      selectedTargetId: null,
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 3, max: 3 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "晓美澪",
          level: 1,
          hp: { current: 1, max: 3 },
          mp: { current: 36, max: 36 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurn: {
        ownerSide: "enemy",
        icons: [
          { id: "pt-enemy-enemy-1-1", state: "solid" },
          { id: "pt-enemy-enemy-1-2", state: "solid" },
        ],
      },
      pressTurnAllocation: {
        participantIds: ["enemy-1"],
        initialIconCount: 1,
      },
      turnCount: 2,
    });

    const resolved = resolveEnemyTurn(snapshot);

    expect(
      resolved.participants.find(
        (participant) => participant.id === "player-heroine-2",
      ),
    ).toMatchObject({
      hp: { current: 0, max: 3 },
      isDown: true,
    });
    expect(
      resolved.participants.find(
        (participant) => participant.id === "player-heroine-1",
      ),
    ).toMatchObject({
      hp: { current: 2, max: 3 },
      isDown: false,
    });
    expect(resolved.battleLog?.slice(0, 2)).toEqual([
      {
        id: "turn-2-enemy-1-attack-player-heroine-2",
        turnCount: 2,
        side: "enemy",
        actorId: "enemy-1",
        actionId: "enemy_attack",
        targetId: "player-heroine-2",
        summary: "first-shadow attacked 晓美澪 for 1 damage.",
      },
      {
        id: "turn-2-enemy-1-attack-player-heroine-1",
        turnCount: 2,
        side: "enemy",
        actorId: "enemy-1",
        actionId: "enemy_attack",
        targetId: "player-heroine-1",
        summary: "first-shadow attacked 鹿目真昼 for 1 damage.",
      },
    ]);
  });

  it("appends structured battle log entries when a player action resolves the battle", () => {
    const snapshot = createActiveBattleSnapshot({
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "last-shadow",
          level: 1,
          hp: { current: 1, max: 1 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      selectedTargetId: "enemy-1",
      battleLog: [
        {
          id: "turn-1-battle-start",
          turnCount: 1,
          side: "system",
          summary: "Battle started.",
        },
      ],
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.battleLog).toEqual([
      {
        id: "turn-1-battle-start",
        turnCount: 1,
        side: "system",
        summary: "Battle started.",
      },
      {
        id: "turn-1-player-heroine-1-attack-enemy-1",
        turnCount: 1,
        side: "player",
        actorId: "player-heroine-1",
        actionId: "attack",
        targetId: "enemy-1",
        summary: "Attack hit",
      },
      {
        id: "turn-1-result-victory",
        turnCount: 1,
        side: "system",
        summary: "Victory: all enemies are down.",
      },
    ]);
  });

  it("creates a resolution payload for attack outcomes before applying snapshot mutations", () => {
    const snapshot = createActiveBattleSnapshot({
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-player-player-heroine-1-1", state: "solid" },
          { id: "pt-player-player-heroine-2-2", state: "solid" },
        ],
      },
      pressTurnAllocation: {
        participantIds: ["player-heroine-1", "player-heroine-2"],
        initialIconCount: 2,
      },
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution).toEqual({
      ok: true,
      actorId: "player-heroine-1",
      actionId: "attack",
      intendedTargetId: "enemy-1",
      outcomes: [
        {
          type: "hit",
          tags: [],
          actorId: "player-heroine-1",
          primaryTargetId: "enemy-1",
          finalTargetId: "enemy-1",
          hpDelta: -1,
        },
      ],
      pressTurnResult: {
        kind: "consume_one",
        reason: "hit",
        before: {
          ownerSide: "player",
          icons: [
            { id: "pt-player-player-heroine-1-1", state: "solid" },
            { id: "pt-player-player-heroine-2-2", state: "solid" },
          ],
        },
        after: {
          ownerSide: "player",
          icons: [{ id: "pt-player-player-heroine-1-1", state: "solid" }],
        },
      },
      verboseLog: ["player-heroine-1 used Attack on enemy-1."],
      summaryLog: ["Attack hit"],
    });
  });

  it("settles press turn only once using the highest-priority outcome across multiple targets", () => {
    const snapshot = createActiveBattleSnapshot({
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-1", state: "solid" },
          { id: "pt-2", state: "solid" },
          { id: "pt-3", state: "solid" },
        ],
      },
    });

    const resolution = createPressTurnResolutionForOutcomes(snapshot, [
      {
        type: "hit",
        tags: ["weak"],
        actorId: "player-heroine-1",
        finalTargetId: "enemy-1",
        hpDelta: -1,
      },
      {
        type: "miss",
        tags: [],
        actorId: "player-heroine-1",
        finalTargetId: "enemy-2",
      },
    ]);

    expect(resolution.pressTurnResult).toEqual({
      kind: "consume_two",
      reason: "miss",
      before: {
        ownerSide: "player",
        icons: [
          { id: "pt-1", state: "solid" },
          { id: "pt-2", state: "solid" },
          { id: "pt-3", state: "solid" },
        ],
      },
      after: {
        ownerSide: "player",
        icons: [{ id: "pt-1", state: "solid" }],
      },
    });
  });

  it("swaps out an active ally for a reserve ally, consumes one icon, and rotates to the next queued actor", () => {
    const snapshot = createActiveBattleSnapshot({
      currentActorId: "player-heroine-1",
      selectedActionId: "swap",
      selectedTargetId: null,
      selectedSwapOutParticipantId: "player-heroine-2",
      selectedSwapInParticipantId: "player-heroine-3",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "前线成员",
          hp: { current: 100, max: 100 },
          mp: { current: 36, max: 36 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-3",
          side: "player",
          displayName: "后备成员",
          hp: { current: 90, max: 90 },
          mp: { current: 30, max: 30 },
          isDown: false,
          isActive: false,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurnAllocation: {
        participantIds: [
          "player-heroine-1",
          "player-heroine-2",
          "player-heroine-3",
        ],
        initialIconCount: 3,
      },
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-1", state: "solid" },
          { id: "pt-2", state: "solid" },
          { id: "pt-3", state: "solid" },
        ],
      },
    });

    expect(resolveSelectedBattleAction(snapshot)).toMatchObject({
      currentActorId: "player-heroine-2",
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-1", state: "solid" },
          { id: "pt-2", state: "solid" },
        ],
      },
      participants: expect.arrayContaining([
        expect.objectContaining({ id: "player-heroine-2", isActive: false }),
        expect.objectContaining({ id: "player-heroine-3", isActive: true }),
      ]),
    });
  });

  it("can withdraw an active ally without specifying a reserve member", () => {
    const snapshot = createActiveBattleSnapshot({
      currentActorId: "player-heroine-1",
      selectedActionId: "swap",
      selectedTargetId: null,
      selectedSwapOutParticipantId: "player-heroine-2",
      selectedSwapInParticipantId: null,
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "要撤下的成员",
          hp: { current: 100, max: 100 },
          mp: { current: 36, max: 36 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurnAllocation: {
        participantIds: ["player-heroine-1", "player-heroine-2"],
        initialIconCount: 2,
      },
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-1", state: "solid" },
          { id: "pt-2", state: "solid" },
        ],
      },
    });

    expect(resolveSelectedBattleAction(snapshot)).toMatchObject({
      currentActorId: "player-heroine-2",
      pressTurn: {
        ownerSide: "player",
        icons: [{ id: "pt-1", state: "solid" }],
      },
      participants: expect.arrayContaining([
        expect.objectContaining({ id: "player-heroine-2", isActive: false }),
      ]),
    });
  });

  it("does not mutate battle state when the reserve member selected for swap is down", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "swap",
      selectedTargetId: null,
      selectedSwapOutParticipantId: "player-heroine-2",
      selectedSwapInParticipantId: "player-heroine-3",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "前线成员",
          hp: { current: 100, max: 100 },
          mp: { current: 36, max: 36 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-3",
          side: "player",
          displayName: "倒地后备",
          hp: { current: 0, max: 90 },
          mp: { current: 30, max: 30 },
          isDown: true,
          isActive: false,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurnAllocation: {
        participantIds: [
          "player-heroine-1",
          "player-heroine-2",
          "player-heroine-3",
        ],
        initialIconCount: 3,
      },
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-1", state: "solid" },
          { id: "pt-2", state: "solid" },
          { id: "pt-3", state: "solid" },
        ],
      },
    });

    expect(resolveSelectedBattleAction(snapshot)).toEqual(snapshot);
  });

  it("does not mutate battle state when the party has only one active member and no reserve", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "swap",
      selectedTargetId: null,
      selectedSwapOutParticipantId: "player-heroine-1",
      selectedSwapInParticipantId: null,
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurnAllocation: {
        participantIds: ["player-heroine-1"],
        initialIconCount: 1,
      },
    });

    expect(resolveSelectedBattleAction(snapshot)).toEqual(snapshot);
  });

  it("returns a validation error when the phase is invalid for action resolution", () => {
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN",
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution).toEqual({
      ok: false,
      validationError: "phase_invalid",
      actorId: "player-heroine-1",
      actionId: "attack",
      intendedTargetId: "enemy-1",
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    });
  });

  it("returns a validation error when a selective action has no selected target", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedTargetId: null,
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution).toEqual({
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

  it("keeps the battle in PLAYER_COMMAND when press turn icons remain after the attack", () => {
    const snapshot = createActiveBattleSnapshot({
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-player-player-heroine-1-1", state: "solid" },
          { id: "pt-player-player-heroine-1-2", state: "solid" },
        ],
      },
      pressTurnAllocation: {
        participantIds: ["player-heroine-1", "player-heroine-2"],
        initialIconCount: 2,
      },
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "雾岛光",
          level: 1,
          hp: { current: 100, max: 100 },
          mp: { current: 36, max: 36 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.phase).toBe("PLAYER_COMMAND");
    expect(resolved.lifecycleState).toBe("ACTIVE");
    expect(resolved.pressTurn).toEqual({
      ownerSide: "player",
      icons: [{ id: "pt-player-player-heroine-1-1", state: "solid" }],
    });
    expect(resolved.currentActorId).toBe("player-heroine-2");
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

  it("does not mutate battle state when no selected action is present", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: null,
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual(snapshot);
  });

  it("does not mutate battle state when a selective action has no selected target", () => {
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

  it("does not mutate battle state when the selected target side is not allowed by the action definition", () => {
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
          isActive: true,
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
          isActive: true,
          statusEffects: [],
        },
      ],
      selectedTargetId: "enemy-1",
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toEqual(snapshot);
  });

  it("resolves guard by marking the actor as guarding and consuming one press turn icon", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "guard",
      selectedTargetId: null,
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolution).toEqual({
      ok: true,
      actorId: "player-heroine-1",
      actionId: "guard",
      intendedTargetId: null,
      outcomes: [
        {
          type: "hit",
          tags: [],
          actorId: "player-heroine-1",
          primaryTargetId: "player-heroine-1",
          finalTargetId: "player-heroine-1",
          appliedStatusEffects: ["guarding"],
        },
      ],
      pressTurnResult: {
        kind: "consume_one",
        reason: "hit",
        before: {
          ownerSide: "player",
          icons: [{ id: "pt-player-player-heroine-1-1", state: "solid" }],
        },
        after: {
          ownerSide: "player",
          icons: [],
        },
      },
      verboseLog: ["player-heroine-1 guarded."],
      summaryLog: ["Guard used"],
    });
    expect(resolved.phase).toBe("ENEMY_TURN");
    expect(
      resolved.participants.find(
        (participant) => participant.id === "player-heroine-1",
      ),
    ).toMatchObject({
      statusEffects: ["guarding"],
    });
    expect(resolved.battleLog?.at(-1)).toEqual({
      id: "turn-1-player-heroine-1-guard-none",
      turnCount: 1,
      side: "player",
      actorId: "player-heroine-1",
      actionId: "guard",
      summary: "Guard used",
    });
  });

  it("resolves a basic skill by spending actor MP and damaging the selected enemy", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedTargetId: "enemy-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 3, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 3, max: 3 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolution).toEqual({
      ok: true,
      actorId: "player-heroine-1",
      actionId: "basic-skill",
      intendedTargetId: "enemy-1",
      outcomes: [
        {
          type: "hit",
          tags: [],
          actorId: "player-heroine-1",
          primaryTargetId: "enemy-1",
          finalTargetId: "enemy-1",
          hpDelta: -2,
        },
        {
          type: "hit",
          tags: [],
          actorId: "player-heroine-1",
          primaryTargetId: "player-heroine-1",
          finalTargetId: "player-heroine-1",
          mpDelta: -3,
        },
      ],
      pressTurnResult: {
        kind: "consume_one",
        reason: "hit",
        before: {
          ownerSide: "player",
          icons: [{ id: "pt-player-player-heroine-1-1", state: "solid" }],
        },
        after: {
          ownerSide: "player",
          icons: [],
        },
      },
      verboseLog: ["player-heroine-1 used basic-skill on enemy-1."],
      summaryLog: ["Basic Skill hit"],
    });
    expect(
      resolved.participants.find(
        (participant) => participant.id === "player-heroine-1",
      ),
    ).toMatchObject({
      mp: { current: 0, max: 48 },
    });
    expect(
      resolved.participants.find((participant) => participant.id === "enemy-1"),
    ).toMatchObject({
      hp: { current: 1, max: 3 },
      isDown: false,
    });
  });

  it("does not mutate battle state when a basic skill actor has insufficient MP", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedTargetId: "enemy-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 2, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 3, max: 3 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolution).toEqual({
      ok: false,
      validationError: "insufficient_mp",
      actorId: "player-heroine-1",
      actionId: "basic-skill",
      intendedTargetId: "enemy-1",
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    });
    expect(resolved).toEqual(snapshot);
  });

  it("resolves a basic item by healing the selected player without exceeding max HP", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-item",
      selectedTargetId: "player-heroine-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 119, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolution).toEqual({
      ok: true,
      actorId: "player-heroine-1",
      actionId: "basic-item",
      intendedTargetId: "player-heroine-1",
      outcomes: [
        {
          type: "hit",
          tags: [],
          actorId: "player-heroine-1",
          primaryTargetId: "player-heroine-1",
          finalTargetId: "player-heroine-1",
          hpDelta: 2,
        },
      ],
      pressTurnResult: {
        kind: "consume_one",
        reason: "hit",
        before: {
          ownerSide: "player",
          icons: [{ id: "pt-player-player-heroine-1-1", state: "solid" }],
        },
        after: {
          ownerSide: "player",
          icons: [],
        },
      },
      verboseLog: ["player-heroine-1 used basic-item on player-heroine-1."],
      summaryLog: ["Basic Item healed"],
    });
    expect(
      resolved.participants.find(
        (participant) => participant.id === "player-heroine-1",
      ),
    ).toMatchObject({
      hp: { current: 120, max: 120 },
    });
  });

  it("settles pass once and rotates to the next eligible actor", () => {
    const snapshot = createActiveBattleSnapshot({
      currentActorId: "player-heroine-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "晓美澪",
          hp: { current: 90, max: 90 },
          mp: { current: 36, max: 36 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurnAllocation: {
        participantIds: ["player-heroine-1", "player-heroine-2"],
        initialIconCount: 2,
      },
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-1", state: "solid" },
          { id: "pt-2", state: "solid" },
        ],
      },
      selectedActionId: "pass",
      selectedTargetId: null,
    });

    expect(resolveSelectedBattleAction(snapshot)).toMatchObject({
      currentActorId: "player-heroine-2",
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-1", state: "solid" },
          { id: "pt-2", state: "blinking" },
        ],
      },
      phase: "PLAYER_COMMAND",
    });
  });

  it("skips down or disabled members when rotating current actor", () => {
    const snapshot = createActiveBattleSnapshot({
      currentActorId: "player-heroine-2",
      selectedActionId: "pass",
      selectedTargetId: null,
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "down-member",
          hp: { current: 0, max: 90 },
          mp: { current: 36, max: 36 },
          isDown: true,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-3",
          side: "player",
          displayName: "sealed-member",
          hp: { current: 90, max: 90 },
          mp: { current: 36, max: 36 },
          isDown: false,
          isActive: true,
          canAct: false,
          statusEffects: [],
        },
        {
          id: "player-heroine-4",
          side: "player",
          displayName: "next-member",
          hp: { current: 90, max: 90 },
          mp: { current: 36, max: 36 },
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurnAllocation: {
        participantIds: [
          "player-heroine-1",
          "player-heroine-2",
          "player-heroine-3",
          "player-heroine-4",
        ],
        initialIconCount: 4,
      },
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-1", state: "solid" },
          { id: "pt-2", state: "solid" },
        ],
      },
    });

    expect(resolveSelectedBattleAction(snapshot)).toMatchObject({
      currentActorId: "player-heroine-1",
    });
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
          isActive: true,
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
          isActive: true,
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
          isActive: true,
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
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurn: {
        ownerSide: "player",
        icons: [],
      },
      pressTurnAllocation: {
        participantIds: ["player-heroine-1"],
        initialIconCount: 1,
      },
      turnCount: 1,
      selectedTargetId: "enemy-1",
      currentActorId: null,
      currentMenuNodeId: null,
      selectedActionId: "attack",
      actionMenu: createDefaultBattleCommandMenuTree(),
      battleResult: {
        outcome: "victory",
        winningSide: "player",
        endReason: "all_enemies_down",
        turnCount: 1,
        survivingParticipantIds: ["player-heroine-1"],
        downParticipantIds: ["enemy-1"],
      },
      resultSummary: "Victory",
      battleLog: [
        {
          id: "turn-1-player-heroine-1-attack-enemy-1",
          turnCount: 1,
          side: "player",
          actorId: "player-heroine-1",
          actionId: "attack",
          targetId: "enemy-1",
          summary: "Attack hit",
        },
        {
          id: "turn-1-result-victory",
          turnCount: 1,
          side: "system",
          summary: "Victory: all enemies are down.",
        },
      ],
    });
  });
});
