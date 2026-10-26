import { computed, nextTick, onScopeDispose, provide, ref, shallowRef, watch, type InjectionKey } from "vue";
import { useBattleStore } from "@/stores/battleStore";
import { useBattleEffects } from "@/composables/useBattleEffects";
import { cloneBattlePresentationData } from "@/stores/battlePresentationData";
import type { BattleSnapshot } from "@/types/battle";
import type { EffectPlayback } from "./battleEffectsRenderer";

export const battleInspectionKey: InjectionKey<{ open: () => () => void }> = Symbol("battle-inspection");
export interface BattleEffectPlayer {
  play: (input: EffectPlayback) => Promise<void>;
  cancel: () => void;
}

export function useBattlePresentation(store: ReturnType<typeof useBattleStore>, player: () => BattleEffectPlayer | null) {
  const { effectiveMode } = useBattleEffects();
  const held = shallowRef<BattleSnapshot | null>(null);
  const busy = ref(false);
  const actionText = ref("");
  const feedback = ref("");
  let generation = 0;
  let resolving = false;
  let inspections = 0;
  let ready = Promise.resolve();
  let release: (() => void) | undefined;
  const displayedBattle = computed(() => held.value ?? store.activeBattle);

  function skip() {
    generation++;
    player()?.cancel();
    held.value = null;
    busy.value = false;
    actionText.value = "";
    feedback.value = "";
    release?.();
    release = undefined;
  }
  provide(battleInspectionKey, {
    open() {
      skip();
      inspections++;
      let closed = false;
      return () => { if (!closed) { closed = true; inspections--; } };
    },
  });

  async function run(action: () => void): Promise<void> {
    if (busy.value) return;
    const before = store.activeBattle;
    if (!before) { action(); return; }
    const serial = store.actionSerial;
    if (effectiveMode.value === "off" || inspections || document.hidden) { action(); return; }
    const captured = cloneBattlePresentationData(before);
    const token = ++generation;
    busy.value = true;
    held.value = captured;
    ready = new Promise(resolve => { release = resolve; });
    resolving = true;
    try { action(); }
    catch (error) { skip(); throw error; }
    finally { resolving = false; }
    const receipt = store.latestActionReceipt;
    if (store.actionSerial === serial || !receipt || inspections || document.hidden) {
      skip(); return;
    }
    const actor = captured.participants.find(p => p.id === receipt.actorId)?.displayName;
    actionText.value = actor ? `${actor} · ${receipt.name}` : receipt.name;
    feedback.value = "";
    try {
      await nextTick();
      if (token !== generation) return;
      const renderer = player();
      if (renderer) await renderer.play({
        action: cloneBattlePresentationData(receipt), before: captured, mode: effectiveMode.value,
        reveal: () => { if (token === generation) held.value = null; },
        feedback: text => { if (token === generation) feedback.value = text; },
      });
    } catch { /* Decoration failure cannot block the canonical result. */ }
    finally { if (token === generation) skip(); }
  }

  watch(() => [store.activeBattle, store.battleGeneration], () => {
    if (!resolving) skip();
  }, { flush: "sync" });
  watch(effectiveMode, () => { if (busy.value) skip(); }, { flush: "sync" });
  const visibility = () => skip();
  document.addEventListener("visibilitychange", visibility);
  onScopeDispose(() => { skip(); document.removeEventListener("visibilitychange", visibility); });
  return { displayedBattle, busy, actionText, feedback, run, skip, waitUntilReady: () => ready };
}
