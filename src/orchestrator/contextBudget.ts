import type {
  ContextBudget,
  ContextInjectionTrace,
  PromptSegment,
} from "@/orchestrator/harnessContextTypes";

export interface ApplyContextBudgetInput {
  segments: PromptSegment[];
  worldInfoPriorities?: Map<string, number>;
  budget: ContextBudget;
}

export interface ApplyContextBudgetResult {
  segments: PromptSegment[];
  traces: ContextInjectionTrace[];
}

function includedTokenTotal(segments: PromptSegment[]): number {
  return segments
    .filter((segment) => segment.included)
    .reduce((total, segment) => total + segment.tokenEstimate, 0);
}

function dropSegment(
  segments: PromptSegment[],
  segmentId: string,
  reason: string,
): void {
  const segment = segments.find((item) => item.id === segmentId);
  if (!segment || !segment.included) {
    return;
  }

  segment.included = false;
  segment.droppedReason = reason;
}

export function applyContextBudget(
  input: ApplyContextBudgetInput,
): ApplyContextBudgetResult {
  const segments = input.segments.map((segment) => ({ ...segment }));

  const worldInfoSegments = segments.filter(
    (segment) => segment.kind === "world_info" && segment.included,
  );
  const worldInfoByAscPriority = [...worldInfoSegments]
    .filter((segment) => segment.included)
    .sort((left, right) => {
      const leftPriority = input.worldInfoPriorities?.get(left.id) ?? 0;
      const rightPriority = input.worldInfoPriorities?.get(right.id) ?? 0;
      return leftPriority - rightPriority;
    });
  let worldInfoDropIndex = 0;

  while (includedTokenTotal(segments) > input.budget.maxTotalTokens) {
    const remainingWorldInfo =
      worldInfoByAscPriority.length - worldInfoDropIndex;

    if (remainingWorldInfo > 1) {
      dropSegment(
        segments,
        worldInfoByAscPriority[worldInfoDropIndex].id,
        "budget_world_info_priority",
      );
      worldInfoDropIndex += 1;
      continue;
    }

    const oldestHistory = segments.find(
      (segment) => segment.kind === "history" && segment.included,
    );
    if (oldestHistory) {
      dropSegment(segments, oldestHistory.id, "budget_history_recency");
      continue;
    }

    break;
  }

  return {
    segments,
    traces: segments
      .filter((segment) => !segment.included)
      .map((segment) => ({
        sourceId: segment.id,
        kind: segment.kind,
        included: false,
        reason: segment.droppedReason ?? "budget",
        tokenEstimate: segment.tokenEstimate,
      })),
  };
}
