import type { TriggerBattleToolInput } from "@/orchestrator/toolEnvelope";
import {
  BATTLE_LIFECYCLE_STATES,
  BATTLE_PHASES,
  COMBATANT_SIDES,
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
});
