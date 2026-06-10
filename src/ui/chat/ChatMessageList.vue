<script setup lang="ts">
import type { ChatMessage } from "@/types/chat";
import { ref } from "vue";
import { renderMarkdown } from "@/composables/useMarkdown";

const props = defineProps<{
  messages: ChatMessage[];
  beautifyTagName?: string;
}>();

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
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<${escaped}>\\s?([\\s\\S]*?)\\s?</${escaped}>`,
    'g',
  );
  return rawText.replace(regex, '<div class="cot-fold">$1</div>');
}

function renderMessageContent(message: ChatMessage): string {
  let content = message.content;
  if (message.role === "assistant" && props.beautifyTagName) {
    content = beautifyRawContent(content, props.beautifyTagName);
  }
  return renderMarkdown(content);
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
            'chat-message-card__reasoning-fold--expanded': isReasoningExpanded(message.id),
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
              {{ isReasoningExpanded(message.id) ? '▼' : '▶' }}
            </span>
            <span class="chat-message-card__reasoning-label">思考过程</span>
            <span class="chat-message-card__reasoning-count">{{ reasoningCharCount(message) }} 字</span>
            <span v-if="message.provisional" class="chat-message-card__reasoning-live">● 生成中</span>
          </button>
          <pre
            v-if="isReasoningExpanded(message.id)"
            class="chat-message-card__reasoning-content"
          >{{ message.reasoning }}</pre>
        </div>
        <div class="chat-message-card__meta">
          <span class="mg-sticker mg-sticker--pink">{{ getRoleLabel(message) }}</span>
          <span
            class="mg-sticker mg-sticker--dark"
            :data-tone="message.failed ? 'warning' : 'info'"
          >
            {{ getStatusLabel(message) }}
          </span>
        </div>
        <div class="chat-message-card__content" v-html="renderMessageContent(message)" />
      </li>
    </ol>
  </section>
</template>

<style scoped>
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
