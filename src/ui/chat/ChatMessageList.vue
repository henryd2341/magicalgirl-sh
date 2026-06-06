<script setup lang="ts">
import type { ChatMessage } from "@/types/chat";
import { ref } from "vue";
import { useThemeDeco } from "@/composables/useThemeDeco";
const { deco } = useThemeDeco();

const props = defineProps<{
  messages: ChatMessage[];
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
</script>

<template>
  <section
    id="chat-message-list"
    class="chat-message-list mg-panel"
    aria-label="消息列表"
  >
    <header class="chat-message-list__header">
      <p class="hero-kicker-band">Story Feed</p>
      <h2 class="section-heading--playful">剧情讯号流<span v-if="deco.chatKaomoji" aria-hidden="true"> {{ deco.chatKaomoji }}</span></h2>
    </header>

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
        <p class="chat-message-card__content">{{ message.content }}</p>
      </li>
    </ol>
  </section>
</template>
