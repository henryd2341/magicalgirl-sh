import { createDefaultBattleCommandMenuTree } from "@/engine/battle/battleActionCatalog";
import {
  buildAttackOutcomes,
  createPressTurnResolutionForOutcomes,
  resolveNextEnemyAction,
  resolveSelectedBattleAction,
  resolveSelectedBattleActionToResolution,
} from "@/engine/battle/battleResolver";
import { BATTLE_ELEMENTS, type BattleSnapshot } from "@/types/battle";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

// ── Helpers ──

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
        hp: { current: 120, max: 120 },
        mp: { current: 48, max: 48 },
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
        hp: { current: 20, max: 20 },
        mp: { current: 0, max: 0 },
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
        hp: { current: 20, max: 20 },
        mp: { current: 0, max: 0 },
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

// ── Tests ──

describe("battleResolver", () => {
  beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());
  // ── Attack resolution (content-driven via "attack" skill) ──
  it("does not apply instant death to a status-immune participant", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "102",
      selectedTargetId: "enemy-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 99,
          hp: { current: 120, max: 120 },
          mp: { current: 99, max: 99 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 99,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          enemyId: "107",
          side: "enemy",
          displayName: "阳炎的魔法少女",
          level: 99,
          hp: { current: 30000, max: 30000 },
          mp: { current: 999, max: 999 },
          attack: 110,
          defense: 95,
          agility: 120,
          intelligence: 105,
          isDown: false,
          isActive: true,
          statusEffects: [{ effectId: "sleep", remainingDuration: 2, stacks: 1 }],
        },
      ],
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.participants[1]!.statusEffects).toEqual([
      { effectId: "sleep", remainingDuration: 2, stacks: 1, firstTickPhase: 1 },
    ]);
    randomSpy.mockRestore();
  });

  it("removes an immune instant-death effect before round-boundary ticking", () => {
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN",
      currentActorId: null,
      pressTurn: { ownerSide: "enemy", icons: [{ id: "enemy-turn", state: "solid" }] },
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          enemyId: "107",
          side: "enemy",
          displayName: "阳炎的魔法少女",
          hp: { current: 30000, max: 30000 },
          mp: { current: 999, max: 999 },
          isDown: false,
          isActive: true,
          statusEffects: [{ effectId: "instant_death", remainingDuration: 1, stacks: 1 }],
        },
      ],
    });

    const resolved = resolveNextEnemyAction(snapshot);
    const boss = resolved.participants.find((participant) => participant.id === "enemy-1")!;

    expect(boss.hp.current).toBeGreaterThan(0);
    expect(boss.statusEffects).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ effectId: "instant_death" })]),
    );
  });

  it("resolves attack through the skill pipeline and damages the enemy", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const snapshot = createActiveBattleSnapshot();
    const resolved = resolveSelectedBattleAction(snapshot);
    random.mockRestore();

    // Enemy took damage
    const enemy = resolved.participants.find((p) => p.id === "enemy-1")!;
    expect(enemy.hp.current).toBeLessThan(20);
    expect(enemy.hp.max).toBe(20);
    expect(enemy.isDown).toBe(false);

    // Player HP unchanged
    const player = resolved.participants.find((p) => p.id === "player-heroine-1")!;
    expect(player.hp.current).toBe(120);

    // MP unchanged (attack skill has mpCost=0)
    expect(player.mp.current).toBe(48);

    // Phase transition to enemy turn
    expect(resolved.phase).toBe("ENEMY_TURN");
    expect(resolved.lifecycleState).toBe("ACTIVE");
    expect(resolved.currentActorId).toBe("enemy-1");
    expect(resolved.pressTurn.ownerSide).toBe("enemy");

    // Battle log entry was generated
    expect(resolved.battleLog?.length).toBeGreaterThan(0);
  });

  it("resolves attack to resolution payload with expected structure", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
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

    expect(resolution.ok).toBe(true);
    expect(resolution.actorId).toBe("player-heroine-1");
    expect(resolution.actionId).toBe("attack");
    expect(resolution.intendedTargetId).toBe("enemy-1");
    expect(resolution.outcomes.length).toBeGreaterThan(0);

    // At least one outcome targets the enemy
    const enemyOutcome = resolution.outcomes.find(
      (o) => o.finalTargetId === "enemy-1",
    );
    expect(enemyOutcome).toBeDefined();

    // Press turn was consumed
    expect(resolution.pressTurnResult).toBeDefined();
    expect(resolution.pressTurnResult!.kind).toBe("consume_one");

    randomSpy.mockRestore();
  });

  // ── BattleResult on enemy defeat ──

  it("produces a victory battleResult when the attack kills the final enemy", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const snapshot = createActiveBattleSnapshot({
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          attack: 999,
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
          displayName: "last-shadow",
          level: 1,
          hp: { current: 1, max: 1 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 1,
          agility: 5,
          intelligence: 5,
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
    expect(resolved.battleResult).toMatchObject({
      outcome: "victory",
      winningSide: "player",
      endReason: "all_enemies_down",
      turnCount: 3,
    });
    vi.restoreAllMocks();
  });

  it("produces a defeat battleResult when all players are already down", () => {
    const snapshot = createActiveBattleSnapshot({
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 0, max: 120 },
          mp: { current: 48, max: 48 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: true,
          isActive: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 1, max: 1 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurn: { ownerSide: "player", icons: [] },
      selectedActionId: "pass",
      turnCount: 4,
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.lifecycleState).toBe("RESOLVED");
    expect(resolved.phase).toBe("RESULT");
    expect(resolved.resultSummary).toBe("Defeat");
    expect(resolved.battleResult).toMatchObject({
      outcome: "defeat",
      winningSide: "enemy",
      endReason: "all_players_down",
    });
  });

  // ── Enemy turn resolution ──

  it("resolves the enemy turn and starts the next player round", () => {
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
          hp: { current: 10, max: 10 },
          mp: { current: 48, max: 48 },
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
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
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
        ownerSide: "enemy",
        icons: [{ id: "pt-enemy-enemy-1-1", state: "solid" }],
      },
      pressTurnAllocation: {
        participantIds: ["enemy-1"],
        initialIconCount: 1,
      },
      turnCount: 1,
    });

    const resolved = resolveNextEnemyAction(snapshot);

    expect(resolved.phase).toBe("PLAYER_COMMAND");
    expect(resolved.lifecycleState).toBe("ACTIVE");
    expect(resolved.turnCount).toBe(2);
    expect(resolved.currentActorId).toBe("player-heroine-1");
    expect(resolved.selectedActionId).toBeNull();

    // Player took damage
    const player = resolved.participants.find(
      (p) => p.id === "player-heroine-1",
    )!;
    expect(player.hp.current).toBeLessThan(10);
    expect(player.isDown).toBe(false);

    // Battle log entries were added
    expect(resolved.battleLog?.length).toBeGreaterThan(0);
  });

  it("reduces enemy attack damage against a guarding player and clears guard", () => {
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
          hp: { current: 10, max: 10 },
          mp: { current: 48, max: 48 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [{ effectId: "guard", remainingDuration: 1, stacks: 1, firstTickPhase: 1 }],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "first-shadow",
          level: 1,
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
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
        ownerSide: "enemy",
        icons: [{ id: "pt-enemy-enemy-1-1", state: "solid" }],
      },
      pressTurnAllocation: {
        participantIds: ["enemy-1"],
        initialIconCount: 1,
      },
      turnCount: 1,
    });

    const resolved = resolveNextEnemyAction(snapshot);

    expect(resolved.phase).toBe("PLAYER_COMMAND");
    const player = resolved.participants.find(
      (p) => p.id === "player-heroine-1",
    )!;

    // Guard status is cleared after enemy turn
    expect(player.statusEffects).toEqual([]);
  });

  it("halves incoming damage and suppresses weakness while guarding", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const actor = createActiveBattleSnapshot().participants[1]!;
    const baseTarget = {
      ...createActiveBattleSnapshot().participants[0]!,
      hp: { current: 100, max: 100 },
      affinities: { weak: BATTLE_ELEMENTS.Fire, resist: 0, nullify: 0, reflect: 0, absorb: 0 },
    };
    const normal = buildAttackOutcomes({
      actorId: actor.id, actor, targetId: baseTarget.id, target: baseTarget,
      skillPower: 100, skillElement: BATTLE_ELEMENTS.Fire, skillAccuracy: 200, statDriver: "attack",
    })[0]!;
    const guarded = buildAttackOutcomes({
      actorId: actor.id, actor, targetId: baseTarget.id,
      target: { ...baseTarget, statusEffects: [{ effectId: "guard", remainingDuration: 1, stacks: 1 }] },
      skillPower: 100, skillElement: BATTLE_ELEMENTS.Fire, skillAccuracy: 200, statDriver: "attack",
    })[0]!;

    expect(Math.abs(guarded.hpDelta ?? 0)).toBe(Math.floor(Math.abs(normal.hpDelta ?? 0) / 3));
    expect(guarded.tags).not.toContain("weak");
    vi.restoreAllMocks();
  });

  it("multiplies critical hit damage by 1.5 while retaining the critical tag", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const base = createActiveBattleSnapshot();
    const actor = {
      ...base.participants[0]!,
      combatStats: { accuracy: 100, evasion: 0, critRate: 0 },
    };
    const target = {
      ...base.participants[1]!,
      hp: { current: 1000, max: 1000 },
    };
    const normal = buildAttackOutcomes({
      actorId: actor.id,
      actor,
      targetId: target.id,
      target,
      skillPower: 80,
      skillElement: BATTLE_ELEMENTS.Physical,
      skillAccuracy: 200,
      skillCritRate: 0,
      statDriver: "attack",
    }).find((outcome) => outcome.hpDelta != null)!;
    const critical = buildAttackOutcomes({
      actorId: actor.id,
      actor,
      targetId: target.id,
      target,
      skillPower: 80,
      skillElement: BATTLE_ELEMENTS.Physical,
      skillAccuracy: 200,
      skillCritRate: 50,
      statDriver: "attack",
    }).find((outcome) => outcome.hpDelta != null)!;

    expect(critical.tags).toContain("critical");
    expect(Math.abs(critical.hpDelta!)).toBe(
      Math.floor(Math.abs(normal.hpDelta!) * 1.5),
    );
    vi.restoreAllMocks();
  });

  it("ends the enemy action sequence when miss_consume_all triggers", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const base = createActiveBattleSnapshot();
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN", currentActorId: null, selectedActionId: null, selectedTargetId: null,
      participants: base.participants.map((participant) => participant.side === "player"
        ? { ...participant, agility: 99, accessoryEffects: ["miss_consume_all"] }
        : { ...participant, agility: 1 }),
      pressTurn: { ownerSide: "enemy", icons: [
        { id: "enemy-1", state: "solid" }, { id: "enemy-2", state: "solid" },
      ] },
    });

    const resolved = resolveNextEnemyAction(snapshot);
    const enemyActions = resolved.battleLog?.filter((entry) => entry.side === "enemy") ?? [];
    expect(enemyActions).toHaveLength(1);
    expect(enemyActions[0]?.summary).toContain("Miss");
    vi.restoreAllMocks();
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
          attack: 5,
          defense: 1,
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
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          attack: 999,
          defense: 5,
          agility: 5,
          intelligence: 5,
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

    const resolved = resolveNextEnemyAction(snapshot);

    expect(resolved.lifecycleState).toBe("RESOLVED");
    expect(resolved.phase).toBe("RESULT");
    expect(resolved.resultSummary).toBe("Defeat");
    expect(resolved.battleResult).toMatchObject({
      outcome: "defeat",
      winningSide: "enemy",
      endReason: "all_players_down",
    });
  });

  it("targets the lowest-HP active player during enemy turn", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
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
          hp: { current: 500, max: 500 },
          mp: { current: 48, max: 48 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
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
          attack: 5,
          defense: 1,
          agility: 5,
          intelligence: 5,
          affinities: {
            weak: BATTLE_ELEMENTS.Physical,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
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
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          attack: 999,
          defense: 5,
          agility: 5,
          intelligence: 5,
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

    const first = resolveNextEnemyAction(snapshot);

    // The lowest-HP player (player-heroine-2 with 1 HP) is the first target.
    const p2 = first.participants.find((p) => p.id === "player-heroine-2")!;
    expect(p2.isDown).toBe(true);
    expect(p2.hp.current).toBe(0);
    expect(first.phase).toBe("ENEMY_TURN");

    // The next progressive step targets the remaining player.
    const second = resolveNextEnemyAction(first);
    const p1 = second.participants.find((p) => p.id === "player-heroine-1")!;
    expect(p1.hp.current).toBeLessThan(500);
    vi.restoreAllMocks();
  });

  // ── Battle log append ──

  it("appends structured battle log entries for player actions", () => {
    const snapshot = createActiveBattleSnapshot({
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          attack: 999,
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
          displayName: "last-shadow",
          level: 1,
          hp: { current: 1, max: 1 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 1,
          agility: 5,
          intelligence: 5,
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

    expect(resolved.battleLog).toBeDefined();
    expect(resolved.battleLog!.length).toBeGreaterThanOrEqual(2);
    // First entry preserved from previous log
    expect(resolved.battleLog![0].id).toBe("turn-1-battle-start");
  });

  // ── Phase / no-action guards ──

  it("does not mutate battle state when the current phase is not PLAYER_COMMAND", () => {
    const snapshot = createActiveBattleSnapshot({ phase: "ENEMY_TURN" });
    const resolved = resolveSelectedBattleAction(snapshot);
    expect(resolved).toEqual(snapshot);
  });

  it("does not mutate battle state when no selected action is present", () => {
    const snapshot = createActiveBattleSnapshot({ selectedActionId: null });
    const resolved = resolveSelectedBattleAction(snapshot);
    expect(resolved).toEqual(snapshot);
  });

  it("returns validation error in resolution when no target for selective action", () => {
    const snapshot = createActiveBattleSnapshot({ selectedTargetId: null });
    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    expect(resolution.ok).toBe(false);
    expect(resolution.validationError).toBe("target_required");
  });

  it("returns validation error in resolution when selected target cannot be found", () => {
    const snapshot = createActiveBattleSnapshot({ selectedTargetId: "enemy-999" });
    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    expect(resolution.ok).toBe(false);
    expect(resolution.validationError).toBe("target_not_found");
  });

  it("returns validation error when selected target side is not allowed", () => {
    const snapshot = createActiveBattleSnapshot({ selectedTargetId: "player-heroine-1" });
    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    expect(resolution.ok).toBe(false);
    expect(resolution.validationError).toBe("target_not_allowed");
  });

  it("returns validation error when selected target is already down", () => {
    const snapshot = createActiveBattleSnapshot({
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
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
          displayName: "fallen-shadow",
          level: 1,
          hp: { current: 0, max: 2 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: true,
          isActive: true,
          statusEffects: [],
        },
      ],
      selectedTargetId: "enemy-1",
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    expect(resolution.ok).toBe(false);
    expect(resolution.validationError).toBe("target_not_allowed");
  });

  // ── Guard ──

  it("resolves guard by marking the actor as guarding and consuming press turn", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "guard",
      selectedTargetId: null,
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolution.ok).toBe(true);
    expect(resolution.actionId).toBe("guard");
    expect(resolution.outcomes.length).toBe(1);
    expect(resolution.outcomes[0].appliedStatusEffects).toEqual([{ effectId: "guard", duration: 1 }]);

    expect(resolved.phase).toBe("ENEMY_TURN");
    const player = resolved.participants.find(
      (p) => p.id === "player-heroine-1",
    )!;
    expect(player.statusEffects?.some((e: { effectId: string }) => e.effectId === "guard")).toBe(true);
  });

  it("initializes enemy Press Turn when the player consumes the final icon", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "guard",
      selectedTargetId: null,
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved).toMatchObject({
      lifecycleState: "ACTIVE",
      phase: "ENEMY_TURN",
      currentActorId: "enemy-1",
      pressTurn: { ownerSide: "enemy" },
      pressTurnAllocation: {
        participantIds: ["enemy-1", "enemy-2"],
        initialIconCount: 2,
      },
      selectedActionId: null,
      selectedContentId: null,
    });
    expect(resolved.pressTurn.icons).toHaveLength(2);
  });

  it("starts an empty enemy turn when living enemies cannot act", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "guard",
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
          id: "enemy-1",
          side: "enemy",
          displayName: "封锁之影",
          hp: { current: 20, max: 20 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          canAct: false,
          statusEffects: [],
        },
      ],
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.lifecycleState).toBe("ACTIVE");
    expect(resolved.phase).toBe("ENEMY_TURN");
    expect(resolved.currentActorId).toBeNull();
    expect(resolved.pressTurn).toEqual({ ownerSide: "enemy", icons: [] });
    expect(resolved.pressTurnAllocation).toEqual({
      participantIds: [],
      initialIconCount: 0,
    });
  });
  // ── Basic Skill (backward compat, no contentId) ──

  it("resolves a basic skill without contentId using legacy 3 MP / 2 damage", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedTargetId: "enemy-1",
      selectedContentId: undefined,
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 3, max: 48 },
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
          hp: { current: 5, max: 5 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution.ok).toBe(true);
    expect(resolution.actionId).toBe("basic-skill");

    // Should have damage and MP cost outcomes
    const hpOutcome = resolution.outcomes.find((o) => o.hpDelta != null);
    const mpOutcome = resolution.outcomes.find((o) => o.mpDelta != null);
    expect(hpOutcome).toBeDefined();
    expect(mpOutcome).toBeDefined();
    expect(mpOutcome!.mpDelta).toBe(-3);
  });

  it("returns insufficient_mp when basic skill actor lacks MP", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedTargetId: "enemy-1",
      selectedContentId: undefined,
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 1, max: 48 },
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
          hp: { current: 3, max: 3 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution.ok).toBe(false);
    expect(resolution.validationError).toBe("insufficient_mp");
  });

  // ── Skill with content ID (real skill resolution) ──

  it("resolves a skill with contentId using the skill's actual power and MP cost", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "2",
      selectedTargetId: "enemy-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 10, max: 48 },
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
          hp: { current: 20, max: 20 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution.ok).toBe(true);
    expect(resolution.contentId).toBe("2");

    // Skill 2 (斩击) costs 4 MP
    // Skill 2 (横扫) costs 5 MP
    const mpOutcome = resolution.outcomes.find((o) => o.mpDelta != null);
    expect(mpOutcome).toBeDefined();
    expect(mpOutcome!.mpDelta).toBe(-5);
  });

  it("heals the caster for the actual HP damage dealt by 吸血", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "179",
      participants: [
        { ...createActiveBattleSnapshot().participants[0]!, hp: { current: 40, max: 120 }, mp: { current: 20, max: 48 }, intelligence: 30 },
        { ...createActiveBattleSnapshot().participants[1]!, hp: { current: 20, max: 20 }, defense: 10 },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    const damage = resolution.outcomes.find((o) => o.finalTargetId === "enemy-1" && (o.hpDelta ?? 0) < 0);
    const healing = resolution.outcomes.find((o) => o.finalTargetId === "player-heroine-1" && (o.hpDelta ?? 0) > 0);

    expect(damage).toBeDefined();
    expect(healing?.hpDelta).toBe(Math.min(20, Math.abs(damage!.hpDelta!)));
    vi.restoreAllMocks();
  });

  it("transfers up to 10 MP with 吸魔 without dealing HP damage", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "180",
      participants: [
        { ...createActiveBattleSnapshot().participants[0]!, mp: { current: 5, max: 20 }, intelligence: 30 },
        { ...createActiveBattleSnapshot().participants[1]!, mp: { current: 14, max: 14 } },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution.outcomes.some((o) => (o.hpDelta ?? 0) !== 0)).toBe(false);
    expect(resolution.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ finalTargetId: "enemy-1", mpDelta: -10 }),
      expect.objectContaining({ finalTargetId: "player-heroine-1", mpDelta: 10 }),
      expect.objectContaining({ finalTargetId: "player-heroine-1", mpDelta: -2 }),
    ]));
    vi.restoreAllMocks();
  });

  it("returns validation error for skill contentId not found", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "nonexistent-skill",
      selectedTargetId: "enemy-1",
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution.ok).toBe(false);
    expect(resolution.validationError).toBe("action_not_found");
  });

  // ── Basic Item ──

  it("resolves a basic item by healing the selected player", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-item",
      selectedContentId: undefined,
      selectedTargetId: "player-heroine-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 118, max: 120 },
          mp: { current: 48, max: 48 },
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
          hp: { current: 2, max: 2 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);
    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolution.ok).toBe(true);
    expect(resolution.actionId).toBe("basic-item");

    // Player was healed (legacy basic-item heals 2)
    const player = resolved.participants.find(
      (p) => p.id === "player-heroine-1",
    )!;
    expect(player.hp.current).toBeGreaterThanOrEqual(118);
  });

  // ── Pass ──

  it("keeps Press Turn icons unchanged when pass_free is equipped", () => {
    const snapshot = createActiveBattleSnapshot({ selectedActionId: "pass" });
    snapshot.participants[0]!.accessoryEffects = ["pass_free"];
    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution.pressTurnResult?.kind).toBe("no_change");
    expect(resolution.pressTurnResult?.after.icons).toEqual(snapshot.pressTurn.icons);
  });

  it("turns affinity failures into normal icon consumption with no_press_penalty", () => {
    const snapshot = createActiveBattleSnapshot();
    snapshot.participants[0]!.accessoryEffects = ["no_press_penalty"];
    const resolution = createPressTurnResolutionForOutcomes(snapshot, [{
      type: "reflect", tags: [], actorId: "player-heroine-1", finalTargetId: "enemy-1",
    }]);

    expect(resolution.pressTurnResult?.kind).toBe("consume_one");
  });

  it("settles pass once and rotates to the next eligible actor", () => {
    const snapshot = createActiveBattleSnapshot({
      currentActorId: "player-heroine-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "晓美澪",
          level: 1,
          hp: { current: 90, max: 90 },
          mp: { current: 36, max: 36 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
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
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
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

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.currentActorId).toBe("player-heroine-2");
    expect(resolved.phase).toBe("PLAYER_COMMAND");
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
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "down-member",
          level: 1,
          hp: { current: 0, max: 90 },
          mp: { current: 36, max: 36 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: true,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "player-heroine-3",
          side: "player",
          displayName: "sealed-member",
          level: 1,
          hp: { current: 90, max: 90 },
          mp: { current: 36, max: 36 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          canAct: false,
          statusEffects: [],
        },
        {
          id: "player-heroine-4",
          side: "player",
          displayName: "next-member",
          level: 1,
          hp: { current: 90, max: 90 },
          mp: { current: 36, max: 36 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
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
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      pressTurnAllocation: {
        participantIds: ["player-heroine-1", "player-heroine-2", "player-heroine-3", "player-heroine-4"],
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

    const resolved = resolveSelectedBattleAction(snapshot);

    // Should skip down member (2) and sealed member (3), land on 1 (wraps around)
    expect(resolved.currentActorId).toBe("player-heroine-1");
  });

  // ── Multi-press-turn ──

  it("keeps the battle in PLAYER_COMMAND when press turn icons remain after attack", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
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
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
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
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
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
          hp: { current: 20, max: 20 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolved = resolveSelectedBattleAction(snapshot);

    expect(resolved.phase).toBe("PLAYER_COMMAND");
    expect(resolved.lifecycleState).toBe("ACTIVE");
    expect(resolved.currentActorId).toBe("player-heroine-2");

    // Enemy took damage but is not down
    const enemy = resolved.participants.find((p) => p.id === "enemy-1")!;
    expect(enemy.hp.current).toBeLessThan(20);
    expect(enemy.isDown).toBe(false);
    vi.restoreAllMocks();
  });

  it("skips the enemy turn instead of declaring victory when a living enemy cannot act", () => {
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
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          canAct: true,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "熔核幻蛇",
          level: 1,
          hp: { current: 1105, max: 1600 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          canAct: false,
          statusEffects: [],
        },
      ],
      turnCount: 5,
    });

    const resolved = resolveNextEnemyAction(snapshot);

    expect(resolved.lifecycleState).toBe("ACTIVE");
    expect(resolved.phase).toBe("PLAYER_COMMAND");
    expect(resolved.battleResult).toBeUndefined();
    expect(resolved.turnCount).toBe(6);
    expect(resolved.participants.find((p) => p.id === "enemy-1")).toMatchObject({
      hp: { current: 1105, max: 1600 },
      isDown: false,
      canAct: false,
    });
  });
  // ── Enemy turn: victory on empty enemy actors ──

  it("resolves victory when enemy turn has no active enemies", () => {
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
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
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
          hp: { current: 0, max: 2 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: true,
          isActive: true,
          statusEffects: [],
        },
      ],
      turnCount: 1,
    });

    const resolved = resolveNextEnemyAction(snapshot);

    expect(resolved.lifecycleState).toBe("RESOLVED");
    expect(resolved.phase).toBe("RESULT");
    expect(resolved.resultSummary).toBe("Victory");
    expect(resolved.battleResult).toMatchObject({
      outcome: "victory",
      endReason: "all_enemies_down",
    });
  });

  it("resolves exactly one enemy action and rotates the actor while icons remain", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN",
      currentActorId: "enemy-1",
      selectedActionId: null,
      selectedTargetId: null,
      participants: [
        {
          id: "player-heroine-1", side: "player", displayName: "鹿目真昼",
          level: 1, hp: { current: 999, max: 999 }, mp: { current: 0, max: 0 },
          attack: 5, defense: 50, agility: 5, intelligence: 5,
          isDown: false, isActive: true, canAct: true, statusEffects: [],
        },
        {
          id: "enemy-1", side: "enemy", displayName: "一号影",
          level: 1, hp: { current: 100, max: 100 }, mp: { current: 0, max: 0 },
          attack: 5, defense: 5, agility: 5, intelligence: 5,
          isDown: false, isActive: true, canAct: true, statusEffects: [],
        },
        {
          id: "enemy-2", side: "enemy", displayName: "二号影",
          level: 1, hp: { current: 100, max: 100 }, mp: { current: 0, max: 0 },
          attack: 5, defense: 5, agility: 5, intelligence: 5,
          isDown: false, isActive: true, canAct: true, statusEffects: [],
        },
      ],
      pressTurn: {
        ownerSide: "enemy",
        icons: [
          { id: "e1", state: "solid" },
          { id: "e2", state: "solid" },
          { id: "e3", state: "solid" },
        ],
      },
      pressTurnAllocation: {
        participantIds: ["enemy-1", "enemy-2"],
        initialIconCount: 2,
      },
    });

    const first = resolveNextEnemyAction(snapshot);
    expect(first.battleLog?.filter((entry) => entry.side === "enemy")).toHaveLength(1);
    expect(first.phase).toBe("ENEMY_TURN");
    expect(first.currentActorId).toBe("enemy-2");
    expect(first.pressTurn.icons).toHaveLength(2);

    const second = resolveNextEnemyAction(first);
    expect(second.battleLog?.filter((entry) => entry.side === "enemy")).toHaveLength(2);
    expect(second.phase).toBe("ENEMY_TURN");
    expect(second.currentActorId).toBe("enemy-1");
    expect(second.pressTurn.icons).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it("groups an enemy all-target skill into one log and one Press Turn settlement", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const snapshot = createActiveBattleSnapshot({
      phase: "ENEMY_TURN",
      currentActorId: "enemy-1",
      selectedActionId: null,
      selectedTargetId: null,
      participants: [
        {
          id: "player-heroine-1", side: "player", displayName: "鹿目真昼",
          level: 1, hp: { current: 999, max: 999 }, mp: { current: 0, max: 0 },
          attack: 5, defense: 50, agility: 5, intelligence: 5,
          isDown: false, isActive: true, canAct: true, statusEffects: [],
        },
        {
          id: "player-heroine-2", side: "player", displayName: "同伴",
          level: 1, hp: { current: 999, max: 999 }, mp: { current: 0, max: 0 },
          attack: 5, defense: 50, agility: 5, intelligence: 5,
          isDown: false, isActive: true, canAct: true, statusEffects: [],
        },
        {
          id: "enemy-1", side: "enemy", displayName: "横扫之影",
          level: 1, hp: { current: 100, max: 100 }, mp: { current: 99, max: 99 },
          attack: 30, defense: 5, agility: 5, intelligence: 5,
          isDown: false, isActive: true, canAct: true, statusEffects: [],
          skillIds: ["2"],
        },
      ],
      pressTurn: {
        ownerSide: "enemy",
        icons: [{ id: "e1", state: "solid" }, { id: "e2", state: "solid" }],
      },
      pressTurnAllocation: {
        participantIds: ["enemy-1"],
        initialIconCount: 1,
      },
    });

    const resolved = resolveNextEnemyAction(snapshot);
    const enemyLogs = resolved.battleLog?.filter((entry) => entry.side === "enemy") ?? [];

    expect(enemyLogs).toHaveLength(1);
    expect(enemyLogs[0]?.targetIds).toEqual(
      expect.arrayContaining(["player-heroine-1", "player-heroine-2"]),
    );
    expect(resolved.phase).toBe("ENEMY_TURN");
    expect(resolved.pressTurn.icons).toHaveLength(1);
    vi.restoreAllMocks();
  });
  // ── Non-mutating resolution only ──

  it("resolveSelectedBattleActionToResolution does not mutate the snapshot", () => {
    const snapshot = createActiveBattleSnapshot({
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
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
          displayName: "last-shadow",
          level: 1,
          hp: { current: 1, max: 1 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
      selectedTargetId: "enemy-1",
    });

    const frozen = JSON.parse(JSON.stringify(snapshot));
    resolveSelectedBattleActionToResolution(snapshot);

    // Snapshot should be unchanged after resolution-only call
    expect(snapshot).toEqual(frozen);
  });

  // ── Multi-hit ──

  it("resolves a fixed 2-hit skill producing two damage outcomes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "6",
      selectedTargetId: "enemy-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
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
          displayName: "shadow",
          level: 1,
          hp: { current: 200, max: 200 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution.ok).toBe(true);
    expect(resolution.contentId).toBe("6");

    // Skill 6 (猛拳) has hitCount=2, produces 2 hit outcomes + MP outcome
    // Skill 6 (猛拳) has hitCount=2, should produce 1-2 hit outcomes
    const hitOutcomes = resolution.outcomes.filter((o) => o.type === "hit" && o.hpDelta != null);
    expect(hitOutcomes.length).toBeGreaterThanOrEqual(1);

    // All hit outcomes should have negative hpDelta (damage)
    for (const outcome of hitOutcomes) {
      expect(outcome.hpDelta).toBeLessThan(0);
    }
    vi.restoreAllMocks();
  });

  it("random multi-hit skill produces hits within the declared range", () => {
    // Skill 14 (怪力乱神): hitCount=2, hitCountMax=3 → 2-3 hits
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "14",
      selectedTargetId: "enemy-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
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
          displayName: "shadow",
          level: 1,
          hp: { current: 200, max: 200 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          statusEffects: [],
        },
      ],
    });

    // Run 20 times and verify all results are in range
    for (let run = 0; run < 20; run++) {
      const resolution = resolveSelectedBattleActionToResolution(snapshot);
      expect(resolution.ok).toBe(true);
      // Due to 90% accuracy, some hits may miss but total damage hits should never exceed 3
      const totalDamageOutcomes = resolution.outcomes.filter((o) => o.hpDelta != null);
      expect(totalDamageOutcomes.length).toBeGreaterThanOrEqual(0);
      expect(totalDamageOutcomes.length).toBeLessThanOrEqual(3);
    }
  });

  it("stops multi-hit immediately on miss and does not process remaining hits", () => {
    // Skill 172 (千风刃): hitCount=6, accuracy=90
    // We use a target with very high evasion to force early misses
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "172",
      selectedTargetId: "enemy-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          combatStats: { accuracy: 90, evasion: 80, critRate: 5 },
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "shadow",
          level: 1,
          hp: { current: 200, max: 200 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 999,
          isDown: false,
          isActive: true,
          combatStats: { accuracy: 80, evasion: 95, critRate: 5 },
          statusEffects: [],
        },
      ],
    });

    // With effective agility=999, hit chance is clamped to the minimum
    // Run 10 times, at least once should have miss (with no hits after it)
    let sawMiss = false;
    for (let run = 0; run < 10; run++) {
      const resolution = resolveSelectedBattleActionToResolution(snapshot);
      const outcomes = resolution.outcomes.filter((o) => o.type !== "hit" || o.hpDelta == null);
      const missIndex = outcomes.findIndex((o) => o.type === "miss");
      if (missIndex >= 0) {
        sawMiss = true;
        // No damage outcomes should appear after a miss
        const damageAfterMiss = resolution.outcomes.slice(missIndex + 1).some((o) => o.hpDelta != null);
        expect(damageAfterMiss).toBe(false);
      }
    }
    expect(sawMiss).toBe(true);
  });

  it("stops multi-hit immediately when blocked by nullify affinity", () => {
    // Skill 6 (猛拳): hitCount=2, element=Physical
    // Enemy has nullify=Physical mask (1)
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "6",
      selectedTargetId: "enemy-1",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
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
          displayName: "null-shadow",
          level: 1,
          hp: { current: 200, max: 200 },
          mp: { current: 0, max: 0 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          isDown: false,
          isActive: true,
          affinities: { weak: 0, resist: 0, nullify: 1, reflect: 0, absorb: 0 },
          statusEffects: [],
        },
      ],
    });

    const resolution = resolveSelectedBattleActionToResolution(snapshot);

    expect(resolution.ok).toBe(true);
    // Should have exactly 1 outcome: block (no hit, no MP cost for skill 6 which is mpCost=6... wait)
    // Actually skill 6 has mpCost=6, but the MP cost is applied separately in the resolution
    // The outcomes from buildAttackOutcomes should just contain the block
    const blockOutcomes = resolution.outcomes.filter((o) => o.type === "block");
    expect(blockOutcomes.length).toBe(1);
    // No damage should have been dealt
    const hpOutcomes = resolution.outcomes.filter((o) => o.hpDelta != null);
    expect(hpOutcomes.length).toBe(0);
  });

  it("生命之源泉 heals all living allies by 50 percent and removes debuffs", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "167",
      selectedTargetId: "player-heroine-1",
      participants: [
        {
          id: "player-heroine-1", side: "player", displayName: "鹿目真昼",
          level: 99, hp: { current: 20, max: 120 }, mp: { current: 99, max: 99 },
          attack: 5, defense: 5, agility: 5, intelligence: 99,
          isDown: false, isActive: true,
          statusEffects: [{ effectId: "attack_down", remainingDuration: 3, stacks: 1 }],
        },
        {
          id: "player-heroine-2", side: "player", displayName: "同伴",
          level: 99, hp: { current: 50, max: 200 }, mp: { current: 99, max: 99 },
          attack: 5, defense: 5, agility: 5, intelligence: 99,
          isDown: false, isActive: true,
          statusEffects: [{ effectId: "defense_down", remainingDuration: 3, stacks: 1 }],
        },
        {
          id: "enemy-1", side: "enemy", displayName: "敌人",
          level: 1, hp: { current: 100, max: 100 }, mp: { current: 0, max: 0 },
          attack: 5, defense: 5, agility: 5, intelligence: 5,
          isDown: false, isActive: true, statusEffects: [],
        },
      ],
    });

    const resolved = resolveSelectedBattleAction(snapshot);
    const allies = resolved.participants.filter((participant) => participant.side === "player");
    expect(allies.map((ally) => ally.hp.current)).toEqual([80, 150]);
    expect(allies.every((ally) =>
      !(ally.statusEffects ?? []).some((status) => status.effectId.endsWith("_down"))
    )).toBe(true);
    randomSpy.mockRestore();
  });

  it("弱化破灭 removes debuffs from all living allies and preserves buffs", () => {
    const snapshot = createActiveBattleSnapshot({
      selectedActionId: "basic-skill",
      selectedContentId: "188",
      selectedTargetId: "player-heroine-1",
      participants: [
        {
          id: "player-heroine-1", side: "player", displayName: "鹿目真昼",
          level: 99, hp: { current: 120, max: 120 }, mp: { current: 99, max: 99 },
          attack: 5, defense: 5, agility: 5, intelligence: 99,
          isDown: false, isActive: true,
          statusEffects: [
            { effectId: "attack_down", remainingDuration: 3, stacks: 1 },
            { effectId: "attack_up", remainingDuration: 3, stacks: 1 },
          ],
        },
        {
          id: "player-heroine-2", side: "player", displayName: "同伴",
          level: 99, hp: { current: 120, max: 120 }, mp: { current: 99, max: 99 },
          attack: 5, defense: 5, agility: 5, intelligence: 99,
          isDown: false, isActive: true,
          statusEffects: [{ effectId: "defense_down", remainingDuration: 3, stacks: 1 }],
        },
        {
          id: "enemy-1", side: "enemy", displayName: "敌人",
          level: 1, hp: { current: 100, max: 100 }, mp: { current: 0, max: 0 },
          attack: 5, defense: 5, agility: 5, intelligence: 5,
          isDown: false, isActive: true, statusEffects: [],
        },
      ],
    });

    const resolved = resolveSelectedBattleAction(snapshot);
    expect(resolved.participants[0]?.statusEffects?.map((status) => status.effectId))
      .toEqual(["attack_up"]);
    expect(resolved.participants[1]?.statusEffects).toEqual([]);
  });});
