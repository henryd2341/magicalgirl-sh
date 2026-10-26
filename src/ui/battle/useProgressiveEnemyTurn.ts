import type { BattleSnapshot } from "@/types/battle";
import { nextTick, onScopeDispose, watch, type Ref } from "vue";

export interface ProgressiveEnemyTurnOptions {
  battle: Readonly<Ref<BattleSnapshot | null>>;
  advance: () => void | Promise<void>;
  delayMs?: number;
  waitUntilReady?: () => Promise<void>;
  battleGeneration?: () => number;
}

export function useProgressiveEnemyTurn(options: ProgressiveEnemyTurnOptions): { cancel: () => void } {
  const delayMs = options.delayMs ?? 1000;
  let running = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let releaseDelay: (() => void) | undefined;
  const cancel = () => {
    generation++;
    running = false;
    clearTimeout(timer);
    timer = undefined;
    releaseDelay?.();
    releaseDelay = undefined;
  };
  const start = () => {
    if (running || document.hidden || options.battle.value?.phase !== "ENEMY_TURN") return;
    running = true;
    const token = ++generation;
    const encounter = options.battle.value.encounterId;
    const battleGeneration = options.battleGeneration?.();
    const valid = () => generation === token && !document.hidden &&
      options.battle.value?.phase === "ENEMY_TURN" && options.battle.value.encounterId === encounter &&
      options.battleGeneration?.() === battleGeneration;
    void (async () => {
      try {
        while (valid()) {
          await nextTick();
          if (!valid()) return;
          if (options.waitUntilReady) await options.waitUntilReady();
          if (!valid()) return;
          await new Promise<void>(resolve => {
            releaseDelay = resolve;
            timer = setTimeout(() => { timer = undefined; releaseDelay = undefined; resolve(); }, delayMs);
          });
          if (!valid()) return;
          await options.advance();
          if (!valid()) return;
        }
      } finally { if (generation === token) running = false; }
    })();
  };
  watch([() => options.battle.value?.phase, () => options.battle.value?.encounterId, () => options.battleGeneration?.()], () => {
    cancel(); start();
  }, { immediate: true });
  const visibility = () => { cancel(); if (!document.hidden) start(); };
  document.addEventListener("visibilitychange", visibility);
  onScopeDispose(() => { cancel(); document.removeEventListener("visibilitychange", visibility); });
  return { cancel };
}
