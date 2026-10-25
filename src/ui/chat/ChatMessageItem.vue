<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { ChatMessage } from '@/types/chat';
import { renderMessageBody } from '@/ui/chat/messagePresentation';

const props = defineProps<{
  message: ChatMessage;
  beautifyTagName?: string;
  reasoningChoice?: boolean;
  detailsChoices?: Record<number, boolean>;
  editing: boolean;
  draft: string;
  copied: boolean;
  retryDisabled: boolean;
}>();
const emit = defineEmits<{
  copy: [];
  edit: [];
  save: [];
  cancel: [];
  retry: [];
  draft: [value: string];
  reasoning: [value: boolean];
  detail: [index: number, open: boolean];
}>();
const raw = computed(() => props.message.content);
const role = computed(() => props.message.role);
const html = computed(() => renderMessageBody(raw.value, role.value, props.beautifyTagName));
const expanded = computed(() => props.reasoningChoice ?? props.message.provisional);
const status = computed(() =>
  props.message.failed
    ? '失败草稿'
    : props.message.provisional
      ? '生成中'
      : props.message.finalized
        ? '已确认'
        : '待处理',
);
const body = ref<HTMLElement | null>(null);
const knownDetails = new WeakMap<HTMLDetailsElement, boolean>();
watch(
  [html, body, () => props.editing],
  async () => {
    await nextTick();
    body.value?.querySelectorAll('details').forEach((detail, index) => {
      if (props.detailsChoices?.[index] !== undefined) detail.open = props.detailsChoices[index];
      knownDetails.set(detail, detail.open);
    });
  },
  { flush: 'post' },
);
function onToggle(event: Event) {
  const detail = event.target;
  if (!(detail instanceof HTMLDetailsElement) || !body.value) return;
  if (knownDetails.get(detail) === detail.open) return;
  knownDetails.set(detail, detail.open);
  emit('detail', [...body.value.querySelectorAll('details')].indexOf(detail), detail.open);
}
function onEditKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    emit('save');
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('cancel');
  }
}
</script>

<template>
  <article
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
      <span class="mg-sticker mg-sticker--pink">{{
        message.role === 'user' ? '玩家' : message.role === 'assistant' ? '叙事 AI' : '系统'
      }}</span>
      <span class="mg-sticker mg-sticker--dark" :data-tone="message.failed ? 'warning' : 'info'">{{ status }}</span>
    </div>
    <div v-if="message.role === 'assistant' && message.reasoning" class="chat-message-card__reasoning-fold">
      <button
        class="chat-message-card__reasoning-toggle"
        type="button"
        :aria-expanded="expanded"
        @click="emit('reasoning', !expanded)"
      >
        <span aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
        <span>思考过程</span><span class="chat-message-card__reasoning-count">{{ message.reasoning.length }} 字</span>
        <span v-if="message.provisional" class="chat-message-card__reasoning-live">● 正在思考</span>
      </button>
      <div v-if="expanded" class="chat-message-card__reasoning-content">{{ message.reasoning }}</div>
    </div>
    <template v-if="editing">
      <textarea
        :value="draft"
        class="chat-message-card__edit-input"
        rows="6"
        aria-label="编辑消息内容"
        @input="emit('draft', ($event.target as HTMLTextAreaElement).value)"
        @keydown="onEditKeydown"
      />
      <div class="chat-message-card__edit-actions">
        <button class="mg-btn-action mg-btn-action--confirm" aria-label="确认编辑" @click="emit('save')">确认</button>
        <button class="mg-btn-action" aria-label="取消编辑" @click="emit('cancel')">取消</button>
      </div>
    </template>
    <div v-else ref="body" class="chat-message-card__content" @toggle.capture="onToggle" v-html="html" />
    <div v-if="message.role !== 'system'" class="chat-message-card__actions">
      <button
        class="mg-btn-action"
        :class="{ 'mg-btn-action--copied': copied }"
        :aria-label="copied ? '已复制到剪贴板' : '复制消息原始内容'"
        @click="emit('copy')"
      >
        {{ copied ? '已复制✓' : '复制' }}
      </button>
      <button
        class="mg-btn-action"
        aria-label="编辑消息"
        :disabled="message.provisional"
        :title="message.provisional ? 'AI 正在生成中，不可编辑' : '编辑消息内容'"
        @click="emit('edit')"
      >
        编辑
      </button>
      <button
        class="mg-btn-action mg-btn-action--retry"
        aria-label="重新生成"
        :disabled="message.provisional || retryDisabled"
        :title="message.provisional ? 'AI 正在生成中' : retryDisabled ? '故事回合进行中' : '重新生成此消息'"
        @click="emit('retry')"
      >
        重试
      </button>
    </div>
  </article>
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

.chat-message-card__reasoning-fold {
  border: 0;
  border-radius: var(--mg-radius-sm);
  background: transparent;
}
.chat-message-card__reasoning-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 0;
  color: var(--mg-text-secondary);
  background: transparent;
  font: inherit;
  font-size: 14px;
  text-align: left;
  flex-wrap: wrap;
  border: 0;
  cursor: pointer;
}
.chat-message-card__reasoning-count {
  font-size: 14px;
}
.chat-message-card__reasoning-live {
  color: var(--mg-accent);
  font-size: 14px;
}
.chat-message-card__reasoning-content,
.chat-message-card__content :deep(.cot-fold) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  font-size: 14px;
  line-height: 1.7;
  color: var(--mg-text-secondary);
  margin: 0 0 8px 4px;
  padding: 8px 14px;
  border-left: 2px solid var(--mg-border-light);
  background: transparent;
  border-radius: 0;
  max-height: none;
}
.chat-message-card__content :deep(.chat-tool-chip) {
  box-sizing: border-box;
  max-width: 100%;
  overflow-wrap: anywhere;
  border: 1px solid var(--mg-border-light);
  border-radius: var(--mg-radius-sm);
  background: var(--mg-bg-input);
  padding: 0 10px;
  margin: 8px 0 0;
  font-size: 14px;
}
.chat-message-card__content :deep(.chat-tool-chip:not([open])) {
  display: inline-block;
  width: fit-content;
  vertical-align: top;
}
.chat-message-card__content :deep(.chat-tool-chip[open]) {
  display: block;
  width: 100%;
}
.chat-message-card__content :deep(.chat-tool-chip > summary) {
  box-sizing: border-box;
}
.chat-message-card__content :deep(.chat-tool-fold),
.chat-message-card__content :deep(.mg-fold) {
  border: 1px solid var(--mg-border);
  border-radius: var(--mg-radius-sm);
  background: var(--mg-bg-input);
  padding: 0 12px;
  margin: 12px 12px;
  font-size: 14px;
  box-shadow: var(--mg-shadow-card);
}
.chat-message-card__content :deep(summary) {
  min-height: 44px;
  padding: 10px 0;
  color: var(--mg-text-secondary);
  cursor: pointer;
  font-size: 14px;
  line-height: 24px;
}
.chat-message-card__content :deep(.chat-tool-fold)::details-content,
.chat-message-card__content :deep(.mg-fold)::details-content {
  block-size: 0;
  overflow: hidden;
  content-visibility: hidden;
  transition: 
    block-size 0.35s ease,
    content-visibility 0.35s;
  transition-behavior: allow-discrete;
}
.chat-message-card__content :deep(.chat-tool-fold)[open]::details-content,
.chat-message-card__content :deep(.mg-fold)[open]::details-content {
  block-size: auto;
  content-visibility: visible;
}
.chat-message-card__content :deep(p:first-child) {
  margin-top: 0;
}
.chat-message-card__content :deep(p:last-child) {
  margin-bottom: 0;
}
.chat-message-card__actions {
  opacity: 1;
}
.chat-message-card .mg-btn-action {
  font-size: 14px;
}
.chat-message-card__edit-input {
  font-size: 16px;
}
button:focus-visible,
textarea:focus-visible,
.chat-message-card__content :deep(summary:focus-visible) {
  outline: 2px solid var(--mg-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
