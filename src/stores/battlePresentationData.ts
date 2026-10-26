import { toRaw } from "vue";
import { deepClone } from "@/utils/deepClone";
import type { BattleActionTrace, BattleSnapshot } from "@/types/battle";

// Resolver spreads can retain nested Vue proxies, including availableSkillIds Sets.
function unwrapBattleData(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const raw = toRaw(value);
  if (raw instanceof Set) return new Set([...raw].map(unwrapBattleData));
  if (Array.isArray(raw)) return raw.map(unwrapBattleData);
  return Object.fromEntries(Object.entries(raw).map(([key, child]) => [key, unwrapBattleData(child)]));
}

export function cloneBattlePresentationData<T extends BattleSnapshot | BattleActionTrace>(value: T): T {
  return deepClone(unwrapBattleData(value)) as T;
}
