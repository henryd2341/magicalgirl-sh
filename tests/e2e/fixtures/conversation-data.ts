import type { ChatMessage } from "@/types/chat";

export function conversationMessages(count: number, prefix = "fixture"): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    role: i % 7 === 0 ? "user" : i % 11 === 0 ? "system" : "assistant",
    kind: "normal",
    content:
      `记录 ${i} · 雨后的街道\n\n` +
      "路灯映在水洼里，你听见远处传来的风铃声。".repeat(i % 23 === 0 ? 400 : 2 + (i % 5)) +
      (i % 13 === 0 ? "\n\n| 地点 | 时间 |\n| --- | --- |\n| 天台 | 黄昏 |\n\n```ts\nconst story = '继续';\n```" : "") +
      (i % 17 === 0
        ? "\n\n<details><summary>街角的信</summary><p>叙事线索 ORCHID [a+b] &lt;moon&gt;</p></details>"
        : "") +
      (i % 19 === 1 ? "\n\n<think>thought-secret 思考秘密</think>\n\n故事继续。" : "") +
      (i % 29 === 2
        ? '\n\n<details class="chat-tool-fold"><summary>工具调用 (1)</summary><div>tool-secret 原始记录</div></details>'
        : ""),
    reasoning: i % 9 === 1 ? "reasoning-secret 思考内容。".repeat(25) : undefined,
    user_visible: i % 31 !== 3,
    ai_visible: true,
    provisional: i === count - 1,
    finalized: i !== count - 1,
    failed: i === count - 3,
    created_at: "2026-10-24T00:00:00.000Z",
  }));
}
