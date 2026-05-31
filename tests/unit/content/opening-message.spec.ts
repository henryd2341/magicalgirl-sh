import { renderOpeningMessage } from "@/content/openingMessage";
import { describe, expect, it } from "vitest";

describe("opening message", () => {
  it("renders a finalized assistant message with the player name interpolated", () => {
    const message = renderOpeningMessage({
      playerName: "鹿目真昼",
      playerGender: "女",
      now: "2026-09-15T00:01:00.000Z",
    });

    expect(message.id).toBe("msg-opening-ceremony");
    expect(message.role).toBe("assistant");
    expect(message.kind).toBe("normal");
    expect(message.content).toContain("鹿目真昼");
    expect(message.content.length).toBeGreaterThan(100);
    expect(message.user_visible).toBe(true);
    expect(message.ai_visible).toBe(true);
    expect(message.provisional).toBe(false);
    expect(message.finalized).toBe(true);
    expect(message.failed).toBe(false);
    expect(message.created_at).toBe("2026-09-15T00:01:00.000Z");
  });

  it("renders the default name placeholder when player name is empty", () => {
    const message = renderOpeningMessage({
      playerName: "",
      playerGender: "女",
      now: "2026-09-15T00:02:00.000Z",
    });

    expect(message.content).not.toContain("{{user}}");
  });

  it("does not inject request metadata fields", () => {
    const message = renderOpeningMessage({
      playerName: "鹿目真昼",
      playerGender: "女",
      now: "2026-09-15T00:03:00.000Z",
    });

    expect(message.request_id).toBeUndefined();
    expect(message.context_version).toBeUndefined();
    expect(message.tool_call_id).toBeUndefined();
  });
});
