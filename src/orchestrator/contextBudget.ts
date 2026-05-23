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
  const sortedWorldInfo = [...worldInfoSegments].sort((left, right) => {
    const leftPriority = input.worldInfoPriorities?.get(left.id) ?? 0;
    const rightPriority = input.worldInfoPriorities?.get(right.id) ?? 0;
    return rightPriority - leftPriority;
  });

  for (
    let index = input.budget.maxWorldInfoEntries;
    index < sortedWorldInfo.length;
    index += 1
  ) {
    dropSegment(segments, sortedWorldInfo[index].id, "budget_world_info_count");
  }

  const historySegments = segments.filter(
    (segment) => segment.kind === "history" && segment.included,
  );
  const extraHistoryCount =
    historySegments.length - input.budget.maxHistoryMessages;
  for (let index = 0; index < extraHistoryCount; index += 1) {
    dropSegment(segments, historySegments[index].id, "budget_history_count");
  }

  while (includedTokenTotal(segments) > input.budget.maxTotalTokens) {
    const includedWorldInfo = segments
      .filter((segment) => segment.kind === "world_info" && segment.included)
      .sort((left, right) => {
        const leftPriority = input.worldInfoPriorities?.get(left.id) ?? 0;
        const rightPriority = input.worldInfoPriorities?.get(right.id) ?? 0;
        return leftPriority - rightPriority;
      });

    if (includedWorldInfo.length > 1) {
      dropSegment(
        segments,
        includedWorldInfo[0].id,
        "budget_world_info_priority",
      );
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
