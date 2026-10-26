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

  it("resumes an existing enemy turn and advances after the default 1000ms delay", async () => {
    const battle = shallowRef<BattleSnapshot | null>(snapshot("ENEMY_TURN"));
    const advance = vi.fn(() => {
      battle.value = snapshot("PLAYER_COMMAND");
    });

    createScope().run(() => {
      useProgressiveEnemyTurn({ battle, advance });
    });

    await vi.advanceTimersByTimeAsync(999);
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

  it("waits for presentation readiness and each async action without overlapping", async () => {
    const battle = shallowRef<BattleSnapshot | null>(snapshot("ENEMY_TURN"));
    let ready = () => {}; let finish = () => {};
    const readiness = new Promise<void>(resolve => { ready = resolve; });
    const advance = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    createScope().run(() => useProgressiveEnemyTurn({ battle, advance, delayMs: 150, waitUntilReady: () => readiness }));
    await vi.advanceTimersByTimeAsync(2000); expect(advance).not.toHaveBeenCalled();
    ready(); await vi.advanceTimersByTimeAsync(150); expect(advance).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000); expect(advance).toHaveBeenCalledTimes(1);
    battle.value = snapshot("PLAYER_COMMAND"); finish(); await nextTick();
  });

  it("invalidates readiness on same-ID replacement and pauses while hidden", async () => {
    const battle = shallowRef<BattleSnapshot | null>(snapshot("ENEMY_TURN"));
    const identity = shallowRef(0);
    const advance = vi.fn(() => { battle.value = snapshot("PLAYER_COMMAND"); });
    createScope().run(() => useProgressiveEnemyTurn({ battle, advance, delayMs: 150, battleGeneration: () => identity.value }));
    await vi.advanceTimersByTimeAsync(100); identity.value++; await nextTick();
    await vi.advanceTimersByTimeAsync(50); expect(advance).not.toHaveBeenCalled();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(3000); expect(advance).not.toHaveBeenCalled();
    hidden.mockReturnValue(false); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(150); expect(advance).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
  });
});
