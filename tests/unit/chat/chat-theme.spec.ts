/* eslint-disable no-undef */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("chat theme styling", () => {
  it("keeps chat surfaces anchored to the dark theme tokens instead of bright paper backgrounds", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/components.css"),
      "utf-8",
    );

    expect(css).toContain(".chat-message-list");
    expect(css).toContain(".chat-input-box");
    expect(css).toContain(".failed-draft-actions");
    expect(css).toContain("background: var(--bg-panel);");
    expect(css).toContain("color: var(--text-primary);");
    expect(css).toContain(".chat-message-card--user");
    expect(css).toContain(".chat-message-card--assistant");
    expect(css).toContain(".chat-message-card--failed");
    expect(css).toContain("rgba(61, 31, 86, 0.96)");
    expect(css).toContain("rgba(82, 28, 73, 0.96)");
    expect(css).toContain("rgba(74, 39, 22, 0.96)");
    expect(css).not.toContain("background: rgba(255, 244, 250, 0.92);");
    expect(css).not.toContain("background: rgba(255, 255, 255, 0.88);");
    expect(css).not.toContain("background: rgba(255, 255, 255, 0.95);");
  });
});
