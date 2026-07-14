import type { BossUtilityCandidate } from "@/engine/battle/boss/bossTypes";

export interface BossTargetScoreInput {
  hp: {
    current: number;
    max: number;
  };
  isDown: boolean;
}

export interface BossTargetScoreRules {
  hpPreference: "lowest" | "highest";
  downBonus: number;
}

export function scoreBossTarget(
  target: BossTargetScoreInput,
  rules: BossTargetScoreRules,
): number {
  const hpPercent =
    target.hp.max <= 0 ? 0 : (target.hp.current / target.hp.max) * 100;
  const hpScore =
    rules.hpPreference === "lowest" ? 100 - hpPercent : hpPercent;
  return hpScore + (target.isDown ? rules.downBonus : 0);
}

export function selectBossUtilityCandidate(
  candidates: BossUtilityCandidate[],
  random: () => number,
  cooldowns: Record<string, number> = {},
): BossUtilityCandidate | null {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.available &&
      (candidate.cooldownKey == null ||
        (cooldowns[candidate.cooldownKey] ?? 0) <= 0),
  );
  if (eligible.length === 0) {
    return null;
  }

  return (
    eligible
      .map((candidate) => ({
        candidate,
        finalScore: candidate.score + random() * candidate.noise,
      }))
      .sort(
        (left, right) =>
          right.finalScore - left.finalScore ||
          left.candidate.stableOrder - right.candidate.stableOrder,
      )[0]?.candidate ?? null
  );
}
