import type { BattleSnapshot } from "@/types/battle";
import { useProgressiveEnemyTurn } from "@/ui/battle/useProgressiveEnemyTurn";
import {
  effectScope,
  nextTick,
  shallowRef,
  type EffectScope,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function snapshot(phase: BattleSnapshot["phase"]): BattleSnapshot {
  return {
    lifecycleState: phase === "RESULT" ? "RESOLVED" : "ACTIVE",
    phase,
    encounterId: "progressive-enemy-turn",
    source: "story",
    participants: [],
    pressTurn: { ownerSide: "enemy", icons: [] },
  };
}

describe("useProgressiveEnemyTurn", () => {
  const scopes: EffectScope[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const scope of scopes.splice(0)) {
      scope.stop();
    }
    vi.useRealTimers();
  });

  function createScope(): EffectScope {
    const scope = effectScope();
    scopes.push(scope);
    return scope;
  }

  it("resumes an existing enemy turn and advances after the default 600ms delay", async () => {
    const battle = shallowRef<BattleSnapshot | null>(snapshot("ENEMY_TURN"));
    const advance = vi.fn(() => {
      battle.value = snapshot("PLAYER_COMMAND");
    });

    createScope().run(() => {
      useProgressiveEnemyTurn({ battle, advance });
    });

    await vi.advanceTimersByTimeAsync(599);
    expect(advance).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it("keeps a single running pump while enemy-turn snapshots refresh", async () => {
    const battle = shallowRef<BattleSnapshot | null>(snapshot("ENEMY_TURN"));
    const advance = vi.fn(() => {
      battle.value = snapshot("PLAYER_COMMAND");
    });

    createScope().run(() => {
      useProgressiveEnemyTurn({ battle, advance, delayMs: 600 });
    });

    battle.value = snapshot("ENEMY_TURN");
    await nextTick();
    battle.value = snapshot("ENEMY_TURN");
    await nextTick();

    await vi.advanceTimersByTimeAsync(600);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["PLAYER_COMMAND", snapshot("PLAYER_COMMAND")],
    ["RESULT", snapshot("RESULT")],
    ["null", null],
  ] as const)("cancels a pending advance when battle becomes %s", async (_label, nextBattle) => {
    const battle = shallowRef<BattleSnapshot | null>(snapshot("ENEMY_TURN"));
    const advance = vi.fn();

    createScope().run(() => {
      useProgressiveEnemyTurn({ battle, advance, delayMs: 600 });
    });

    await vi.advanceTimersByTimeAsync(300);
    battle.value = nextBattle;
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);

    expect(advance).not.toHaveBeenCalled();
  });

  it("cancels a pending advance when its effect scope stops", async () => {
    const battle = shallowRef<BattleSnapshot | null>(snapshot("ENEMY_TURN"));
    const advance = vi.fn();
    const scope = createScope();

    scope.run(() => {
      useProgressiveEnemyTurn({ battle, advance, delayMs: 600 });
    });

    await vi.advanceTimersByTimeAsync(300);
    scope.stop();
    await vi.advanceTimersByTimeAsync(300);

    expect(advance).not.toHaveBeenCalled();
  });

  it("exposes cancellation for a pending advance", async () => {
    const battle = shallowRef<BattleSnapshot | null>(snapshot("ENEMY_TURN"));
    const advance = vi.fn();
    let cancel = () => {};

    createScope().run(() => {
      ({ cancel } = useProgressiveEnemyTurn({ battle, advance, delayMs: 600 }));
    });

    await vi.advanceTimersByTimeAsync(300);
    cancel();
    await vi.advanceTimersByTimeAsync(300);

    expect(advance).not.toHaveBeenCalled();
  });
});
