import { applyContextBudget } from "@/orchestrator/contextBudget";
import type { PromptSegment } from "@/orchestrator/harnessContextTypes";
import { describe, expect, it } from "vitest";

function segment(
  id: string,
  kind: PromptSegment["kind"],
  tokenEstimate: number,
): PromptSegment {
  return {
    id,
    kind,
    title: id,
    content: `${id} content`,
    source: id,
    tokenEstimate,
    included: true,
  };
}

describe("applyContextBudget", () => {
  it("keeps required segments and drops low priority world info before old history", () => {
    const result = applyContextBudget({
      segments: [
        segment("system", "system", 10),
        segment("world-high", "world_info", 20),
        segment("world-low", "world_info", 20),
        segment("state", "state", 10),
        segment("tools", "tools", 10),
        segment("history-old", "history", 30),
        segment("history-new", "history", 30),
      ],
      worldInfoPriorities: new Map([
        ["world-high", 100],
        ["world-low", 10],
      ]),
      budget: {
        maxTotalTokens: 90,
      },
    });

    expect(result.segments.find((item) => item.id === "system")).toMatchObject({
      included: true,
    });
    expect(result.segments.find((item) => item.id === "state")).toMatchObject({
      included: true,
    });
    expect(result.segments.find((item) => item.id === "tools")).toMatchObject({
      included: true,
    });
    expect(result.segments.find((item) => item.id === "world-high")).toMatchObject({
      included: true,
    });
    expect(result.segments.find((item) => item.id === "world-low")).toMatchObject({
      included: false,
      droppedReason: "budget_world_info_priority",
    });
    expect(result.segments.find((item) => item.id === "history-old")).toMatchObject({
      included: false,
      droppedReason: "budget_history_recency",
    });
    expect(result.segments.find((item) => item.id === "history-new")).toMatchObject({
      included: true,
    });
  });
});
