import type { BattleSnapshot } from "@/types/battle";
import {
  nextTick,
  onScopeDispose,
  watch,
  type Ref,
} from "vue";

export interface ProgressiveEnemyTurnOptions {
  battle: Readonly<Ref<BattleSnapshot | null>>;
  advance: () => void;
  delayMs?: number;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function useProgressiveEnemyTurn(
  options: ProgressiveEnemyTurnOptions,
): { cancel: () => void } {
  const delayMs = options.delayMs ?? 1000;
  let running = false;
  let generation = 0;

  const cancel = (): void => {
    generation += 1;
    running = false;
  };

  const start = (): void => {
    if (running || options.battle.value?.phase !== "ENEMY_TURN") {
      return;
    }

    running = true;
    const currentGeneration = ++generation;

    void (async () => {
      try {
        while (
          generation === currentGeneration
          && options.battle.value?.phase === "ENEMY_TURN"
        ) {
          await nextTick();
          await wait(delayMs);

          if (
            generation !== currentGeneration
            || options.battle.value?.phase !== "ENEMY_TURN"
          ) {
            return;
          }

          options.advance();
        }
      } finally {
        if (generation === currentGeneration) {
          running = false;
        }
      }
    })();
  };

  watch(
    () => options.battle.value?.phase,
    (phase) => {
      if (phase === "ENEMY_TURN") {
        start();
      } else {
        cancel();
      }
    },
    { immediate: true },
  );

  onScopeDispose(cancel);

  return { cancel };
}
