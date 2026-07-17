export const PERMANENT_STAT_CAP = 99;

export type PermanentStat = "attack" | "defense" | "agility" | "intelligence";
export type PermanentBonuses = Record<PermanentStat, number>;

export interface PermanentStatCombat {
  allocatedPoints: PermanentBonuses;
  permanentBonuses?: PermanentBonuses;
}

export type ApplyPermanentStatBonusResult =
  | { ok: true; permanentBonuses: PermanentBonuses; value: number }
  | { ok: false; reason: "stat_capped"; value: number };

const ZERO_BONUSES: PermanentBonuses = {
  attack: 0,
  defense: 0,
  agility: 0,
  intelligence: 0,
};

export function permanentStatValue(
  combat: PermanentStatCombat,
  baseValue: number,
  stat: PermanentStat,
): number {
  return Math.min(
    PERMANENT_STAT_CAP,
    baseValue + combat.allocatedPoints[stat] + (combat.permanentBonuses?.[stat] ?? 0),
  );
}

export function applyPermanentStatBonus(
  combat: PermanentStatCombat,
  baseValue: number,
  bonus: { stat: PermanentStat; amount: number },
): ApplyPermanentStatBonusResult {
  const value = permanentStatValue(combat, baseValue, bonus.stat);
  if (value >= PERMANENT_STAT_CAP) {
    return { ok: false, reason: "stat_capped", value };
  }

  const increase = Math.min(bonus.amount, PERMANENT_STAT_CAP - value);
  const permanentBonuses = { ...ZERO_BONUSES, ...combat.permanentBonuses };
  permanentBonuses[bonus.stat] += increase;
  return { ok: true, permanentBonuses, value: value + increase };
}
