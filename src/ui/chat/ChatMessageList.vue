<script setup lang="ts">
import type { ChatMessage } from "@/types/chat";

const props = defineProps<{
  messages: ChatMessage[];
}>();

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
    class="chat-message-list scrapbook-panel"
    aria-label="消息列表"
  >
    <header class="chat-message-list__header">
      <p class="hero-kicker-band">Story Feed</p>
      <h2 class="section-heading--playful">剧情讯号流</h2>
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
        <div class="chat-message-card__meta">
          <span class="stat-chip">{{ getRoleLabel(message) }}</span>
          <span
            class="status-pill"
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
