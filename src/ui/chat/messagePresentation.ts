import { renderMarkdown } from '@/composables/useMarkdown';
import type { ChatMessageRole } from '@/types/chat';

export function beautifyRawContent(rawText: string, tagName: string): string {
  if (!tagName) return rawText;
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pass 1: well-formed closed pairs
  const closedRegex = new RegExp(`<${escaped}>\\s?([\\s\\S]*?)\\s?</${escaped}>`, 'g');
  let result = rawText.replace(
    closedRegex,
    '<details class="mg-fold"><summary>思考过程</summary><div class="cot-fold">$1</div></details>',
  );

  // Pass 2: unclosed opening tag (content from <tag> to end)
  const unclosedRegex = new RegExp(`<${escaped}>\\s?([\\s\\S]*)$`);
  result = result.replace(
    unclosedRegex,
    '<details class="mg-fold" open><summary>思考过程（未闭合）</summary><div class="cot-fold">$1</div></details>',
  );

  // Pass 3: lone closing tag (有尾无头) — fold content before </tag>
  const loneCloseRegex = new RegExp(`([\\s\\S]*?)</${escaped}>`, 'g');
  result = result.replace(
    loneCloseRegex,
    '<details class="mg-fold" open><summary>思考过程（缺开头）</summary><div class="cot-fold">$1</div></details>',
  );

  return result;
}

export function renderMessageBody(content: string, role: ChatMessageRole, tagName?: string): string {
  return renderMarkdown(role === 'assistant' && tagName ? beautifyRawContent(content, tagName) : content);
}
