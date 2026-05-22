import type {
  AggregatedPressTurnOutcome,
  BattleActionOutcome,
} from "@/types/battle";

export function aggregatePressTurnOutcome(
  outcomes: BattleActionOutcome[],
): AggregatedPressTurnOutcome | null {
  if (outcomes.some((outcome) => outcome.type === "reflect")) {
    return { outcomeType: "reflect", tags: [] };
  }

  if (outcomes.some((outcome) => outcome.type === "absorb")) {
    return { outcomeType: "absorb", tags: [] };
  }

  if (
    outcomes.some(
      (outcome) => outcome.type === "miss" || outcome.type === "block",
    )
  ) {
    const blocked = outcomes.find((outcome) => outcome.type === "block");

    return {
      outcomeType: blocked == null ? "miss" : "block",
      tags: [],
    };
  }

  if (
    outcomes.some(
      (outcome) =>
        outcome.type === "hit" &&
        (outcome.tags.includes("weak") || outcome.tags.includes("critical")),
    )
  ) {
    const weakHit = outcomes.find(
      (outcome) => outcome.type === "hit" && outcome.tags.includes("weak"),
    );

    if (weakHit != null) {
      return { outcomeType: "hit", tags: ["weak"] };
    }

    return { outcomeType: "hit", tags: ["critical"] };
  }

  if (outcomes.some((outcome) => outcome.type === "hit")) {
    return { outcomeType: "hit", tags: [] };
  }

  if (outcomes.some((outcome) => outcome.type === "status_no_effect")) {
    return { outcomeType: "status_no_effect", tags: [] };
  }

  return null;
}
