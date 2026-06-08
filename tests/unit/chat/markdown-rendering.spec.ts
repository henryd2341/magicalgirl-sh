import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/composables/useMarkdown";

describe("renderMarkdown", () => {
  it("renders **bold** as <strong>", () => {
    const result = renderMarkdown("**bold**");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("renders *italic* as <em>", () => {
    const result = renderMarkdown("*italic*");
    expect(result).toContain("<em>italic</em>");
  });

  it("renders [link](url) as clickable <a> tag", () => {
    const result = renderMarkdown("[link](https://example.com)");
    expect(result).toContain('<a href="https://example.com">link</a>');
  });

  it("renders inline `code` as <code> tag", () => {
    const result = renderMarkdown("inline `code`");
    expect(result).toContain("<code>code</code>");
  });

  it("strips <script> tags via DOMPurify", () => {
    const result = renderMarkdown("<script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  it("preserves <details><summary> tags intact", () => {
    const result = renderMarkdown(
      "<details><summary>Click</summary>Content</details>",
    );
    expect(result).toContain("<details>");
    expect(result).toContain("<summary>");
    expect(result).toContain("Click");
    expect(result).toContain("Content");
  });

  it("strips <img> tags (not in allowlist)", () => {
    const result = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onerror");
  });
});
