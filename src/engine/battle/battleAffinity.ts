import {
  BATTLE_ELEMENTS,
  type BattleAffinityProfile,
  type BattleElement,
} from "@/types/battle";

export type BattleAffinityResult =
  | "absorb"
  | "reflect"
  | "nullify"
  | "weak"
  | "resist"
  | "normal";

export function hasElement(mask: number, element: BattleElement): boolean {
  if (element === BATTLE_ELEMENTS.None) {
    return false;
  }

  return (mask & element) === element;
}

export function resolveAffinityResult(
  profile: BattleAffinityProfile,
  element: BattleElement,
): BattleAffinityResult {
  if (hasElement(profile.absorb, element)) {
    return "absorb";
  }

  if (hasElement(profile.reflect, element)) {
    return "reflect";
  }

  if (hasElement(profile.nullify, element)) {
    return "nullify";
  }

  if (hasElement(profile.weak, element)) {
    return "weak";
  }

  if (hasElement(profile.resist, element)) {
    return "resist";
  }

  return "normal";
}
