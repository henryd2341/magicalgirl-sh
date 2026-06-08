import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import type { Config } from "dompurify";

// ─── Module-level singleton instances ──────────────────────────────────────────

const markdownIt = new MarkdownIt({
  html: true, // Allow raw HTML; DOMPurify is the sole security boundary
});

const purifyConfig: Config = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "em", "a", "ul", "ol", "li",
    "pre", "code", "table", "thead", "tbody", "tr", "th", "td",
    "div", "span", "details", "summary",
    "p", "br", "hr", "blockquote",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "id", "open"],
  ADD_ATTR: ["target", "rel"],
};

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof HTMLAnchorElement) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

// ─── Render function ───────────────────────────────────────────────────────────

export function renderMarkdown(raw: string): string {
  const rendered = markdownIt.render(raw);
  return DOMPurify.sanitize(rendered, purifyConfig) as unknown as string;
}
