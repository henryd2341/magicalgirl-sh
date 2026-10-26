import { computed, onScopeDispose, ref } from "vue";

export type BattleEffectsMode = "standard" | "reduced" | "off";
export const BATTLE_EFFECTS_KEY = "mg-battle-effects";
export function normalizeBattleEffects(value: unknown): BattleEffectsMode {
  return value === "reduced" || value === "off" ? value : "standard";
}
function readPreference(): BattleEffectsMode {
  try { return normalizeBattleEffects(localStorage.getItem(BATTLE_EFFECTS_KEY)); }
  catch { return "standard"; }
}
export const battleEffectsPreference = ref<BattleEffectsMode>(readPreference());
export function setBattleEffects(value: unknown): void {
  battleEffectsPreference.value = normalizeBattleEffects(value);
  try { localStorage.setItem(BATTLE_EFFECTS_KEY, battleEffectsPreference.value); }
  catch { /* Session preference still works when storage is unavailable. */ }
}
export function useBattleEffects() {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = ref(media.matches);
  const update = () => { reduced.value = media.matches; };
  media.addEventListener("change", update);
  onScopeDispose(() => media.removeEventListener("change", update));
  return {
    preference: battleEffectsPreference,
    effectiveMode: computed<BattleEffectsMode>(() =>
      battleEffectsPreference.value === "standard" && reduced.value ? "reduced" : battleEffectsPreference.value),
  };
}
