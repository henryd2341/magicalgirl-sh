<script setup lang="ts">
import { useGameDialog } from "@/composables/useGameDialog";
import { renderMarkdown } from "@/composables/useMarkdown";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { ChatMessage } from "@/types/chat";
import { storeToRefs } from "pinia";
import { onUnmounted, ref } from "vue";

const props = defineProps<{
  messages: ChatMessage[];
  beautifyTagName?: string;
}>();

const emit = defineEmits<{
  retry: [messageId: string];
}>();

const chatStore = useChatStore();
const sessionStore = useSessionStore();
const { confirm } = useGameDialog();
const { isStoryTurnRunning } = storeToRefs(sessionStore);

const expandedReasoning = ref<Record<string, boolean>>({});

function toggleReasoning(messageId: string): void {
  expandedReasoning.value[messageId] = !expandedReasoning.value[messageId];
}

function isReasoningExpanded(messageId: string): boolean {
  // Auto-expand during streaming, otherwise respect user toggle
  const message = props.messages.find((m) => m.id === messageId);
  if (message?.provisional && message.reasoning) return true;
  return expandedReasoning.value[messageId] ?? false;
}

function reasoningCharCount(message: ChatMessage): number {
  return message.reasoning ? message.reasoning.length : 0;
}

function getStatusLabel(message: ChatMessage): string {
  if (message.failed) {
    return "失败草稿";
  }

  if (message.provisional) {
    return "生成中";
  }

  if (message.finalized) {
    return "已确认";
  }

  return "待处理";
}

function getRoleLabel(message: ChatMessage): string {
  if (message.role === "user") {
    return "玩家";
  }

  if (message.role === "assistant") {
    return "叙事 AI";
  }

  return "系统";
}

function beautifyRawContent(rawText: string, tagName: string): string {
  if (!tagName) return rawText;
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Pass 1: well-formed closed pairs
  const closedRegex = new RegExp(
    `<${escaped}>\\s?([\\s\\S]*?)\\s?</${escaped}>`,
    "g",
  );
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
  const loneCloseRegex = new RegExp(
    `([\\s\\S]*?)</${escaped}>`,
    "g",
  );
  result = result.replace(
    loneCloseRegex,
    '<details class="mg-fold" open><summary>思考过程（缺开头）</summary><div class="cot-fold">$1</div></details>',
  );

  return result;
}

function renderMessageContent(message: ChatMessage): string {
  let content = message.content;
  if (message.role === "assistant" && props.beautifyTagName) {
    content = beautifyRawContent(content, props.beautifyTagName);
  }
  return renderMarkdown(content);
}

// ── Action button state ──
const copiedId = ref<string | null>(null);
const editingId = ref<string | null>(null);
const editDraft = ref("");
let copyTimeout: ReturnType<typeof setTimeout> | null = null;

onUnmounted(() => {
  if (copyTimeout !== null) clearTimeout(copyTimeout);
});

// ── Action handlers ──
function handleCopy(message: ChatMessage) {
  navigator.clipboard
    .writeText(message.content)
    .then(() => {
      copiedId.value = message.id;
      if (copyTimeout !== null) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copiedId.value = null;
      }, 2000);
    })
    .catch(() => {
      /* clipboard unavailable */
    });
}

function startEdit(message: ChatMessage) {
  if (message.provisional) return;
  editingId.value = message.id;
  editDraft.value = message.content;
}

function cancelEdit() {
  editingId.value = null;
  editDraft.value = "";
}

async function confirmEdit(message: ChatMessage) {
  const trimmed = editDraft.value.trim();
  if (!trimmed) return;
  await chatStore.updateMessageContent({
    messageId: message.id,
    content: trimmed,
  });
  editingId.value = null;
  editDraft.value = "";
}

function onEditKeydown(e: KeyboardEvent, message: ChatMessage) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    confirmEdit(message);
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelEdit();
  }
}

async function handleRetry(message: ChatMessage) {
  if (message.provisional || isStoryTurnRunning.value) return;
  if (
    !(await confirm("确定要重试此消息吗？该消息及之后的所有消息将被删除并重新生成。"))
  )
    return;
  emit("retry", message.id);
}
</script>

<template>
  <section
    id="chat-message-list"
    class="chat-message-list mg-panel"
    aria-label="消息列表"
  >
    <ol class="chat-message-list__items">
      <li
        v-for="message in props.messages"
        :id="`chat-message-${message.id}`"
        :key="message.id"
        class="chat-message-card"
        :class="{
          'chat-message-card--user': message.role === 'user',
          'chat-message-card--assistant': message.role === 'assistant',
          'chat-message-card--system': message.role === 'system',
          'chat-message-card--failed': message.failed,
          'chat-message-card--provisional': message.provisional,
        }"
      >
        <div
          v-if="message.role === 'assistant' && message.reasoning"
          class="chat-message-card__reasoning-fold"
          :class="{
            'chat-message-card__reasoning-fold--expanded': isReasoningExpanded(
              message.id,
            ),
            'chat-message-card__reasoning-fold--streaming': message.provisional,
          }"
        >
          <button
            class="chat-message-card__reasoning-toggle"
            type="button"
            :aria-expanded="isReasoningExpanded(message.id)"
            @click="toggleReasoning(message.id)"
          >
            <span class="chat-message-card__reasoning-arrow">
              {{ isReasoningExpanded(message.id) ? "▼" : "▶" }}
            </span>
            <span class="chat-message-card__reasoning-label">思考过程</span>
            <span class="chat-message-card__reasoning-count"
              >{{ reasoningCharCount(message) }} 字</span
            >
            <span
              v-if="message.provisional"
              class="chat-message-card__reasoning-live"
              >● 生成中</span
            >
          </button>
          <pre
            v-if="isReasoningExpanded(message.id)"
            class="chat-message-card__reasoning-content"
            >{{ message.reasoning }}</pre
          >
        </div>
        <div class="chat-message-card__meta">
          <span class="mg-sticker mg-sticker--pink">{{
            getRoleLabel(message)
          }}</span>
          <span
            class="mg-sticker mg-sticker--dark"
            :data-tone="message.failed ? 'warning' : 'info'"
          >
            {{ getStatusLabel(message) }}
          </span>
        </div>
        <template v-if="editingId === message.id">
          <textarea
            v-model="editDraft"
            class="chat-message-card__edit-input"
            rows="4"
            aria-label="编辑消息内容"
            @keydown="onEditKeydown($event, message)"
          />
          <div class="chat-message-card__edit-actions">
            <button
              class="mg-btn-action mg-btn-action--confirm"
              aria-label="确认编辑"
              @click.stop="confirmEdit(message)"
            >
              确认
            </button>
            <button
              class="mg-btn-action"
              aria-label="取消编辑"
              @click.stop="cancelEdit"
            >
              取消
            </button>
          </div>
        </template>
        <div
          v-else
          class="chat-message-card__content"
          v-html="renderMessageContent(message)"
        />
        <div
          v-if="message.role !== 'system'"
          class="chat-message-card__actions"
        >
          <button
            class="mg-btn-action"
            :class="{ 'mg-btn-action--copied': copiedId === message.id }"
            :aria-label="
              copiedId === message.id ? '已复制到剪贴板' : '复制消息原始内容'
            "
            @click.stop="handleCopy(message)"
          >
            {{ copiedId === message.id ? "已复制✓" : "复制" }}
          </button>
          <button
            class="mg-btn-action"
            aria-label="编辑消息"
            :disabled="message.provisional"
            :title="
              message.provisional ? 'AI 正在生成中，不可编辑' : '编辑消息内容'
            "
            @click.stop="startEdit(message)"
          >
            编辑
          </button>
          <button
            class="mg-btn-action mg-btn-action--retry"
            aria-label="重新生成"
            :disabled="message.provisional || isStoryTurnRunning"
            :title="
              message.provisional
                ? 'AI 正在生成中'
                : isStoryTurnRunning
                  ? '故事回合进行中'
                  : '重新生成此消息'
            "
            @click.stop="handleRetry(message)"
          >
            重试
          </button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.chat-message-card__content {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  min-width: 0;
  max-width: 100%;
}

.chat-message-card__content :deep(pre) {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-message-card__content :deep(code) {
  word-break: break-all;
}

.chat-message-card__content :deep(table) {
  display: block;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}

.chat-message-card__content :deep(img) {
  max-width: 100%;
  height: auto;
}

.chat-message-card__content :deep(.cot-fold) {
  border-left: 3px solid var(--color-accent, #c2185b);
  padding: 0.5em 1em;
  margin: 0.5em 0;
  background: var(--color-surface-2, rgba(255, 255, 255, 0.05));
  border-radius: 4px;
  font-style: italic;
  color: var(--color-text-secondary, #999);
}
</style>
