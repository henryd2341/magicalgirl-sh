<script setup lang="ts">
import { useGameDialog } from '@/composables/useGameDialog';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import type { ChatMessage } from '@/types/chat';
import ChatMessageItem from '@/ui/chat/ChatMessageItem.vue';
import { useConversationViewport } from '@/ui/chat/useConversationViewport';
import { storeToRefs } from 'pinia';
import { nextTick, onUnmounted, reactive, ref, watch } from 'vue';

const props = defineProps<{
  messages: ChatMessage[];
  beautifyTagName?: string;
  virtual?: boolean;
  scrollElement?: HTMLElement | null;
  ready?: boolean;
  historyEpoch?: number;
}>();
const emit = defineEmits<{ retry: [messageId: string] }>();
const chatStore = useChatStore();
const { isStoryTurnRunning } = storeToRefs(useSessionStore());
const { confirm } = useGameDialog();
const list = ref<HTMLElement | null>(null);
const editingId = ref<string | null>(null);
const focusedId = ref<string | null>(null);
const editDraft = ref('');
const copiedId = ref<string | null>(null);
const reasoning = reactive(new Map<string, boolean>());
const details = reactive(new Map<string, Record<number, boolean>>());
const { rows, totalSize, following, measure, read, latest } = useConversationViewport(
  props,
  list,
  editingId,
  focusedId,
);
let copyTimeout: ReturnType<typeof setTimeout> | undefined;
let disposed = false;

function cancelEdit() {
  editingId.value = null;
  editDraft.value = '';
}
function startEdit(message: ChatMessage) {
  if (message.provisional) return;
  read();
  editingId.value = message.id;
  editDraft.value = message.content;
  void nextTick(() =>
    document.getElementById(`chat-message-${message.id}`)?.querySelector('textarea')?.focus({ preventScroll: true }),
  );
}
async function confirmEdit(message: ChatMessage) {
  const trimmed = editDraft.value.trim();
  if (!trimmed) return;
  await chatStore.updateMessageContent({ messageId: message.id, content: trimmed });
  details.delete(message.id);
  cancelEdit();
}
async function handleCopy(message: ChatMessage) {
  try {
    await navigator.clipboard.writeText(message.content);
    if (disposed) return;
    copiedId.value = message.id;
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copiedId.value = null;
    }, 2000);
  } catch {
    /* clipboard unavailable */
  }
}
async function handleRetry(message: ChatMessage) {
  if (message.provisional || isStoryTurnRunning.value) return;
  if (await confirm('确定要重试此消息吗？该消息及之后的所有消息将被删除并重新生成。')) emit('retry', message.id);
}
function rememberDetail(id: string, index: number, open: boolean) {
  if (!details.has(id)) details.set(id, {});
  details.get(id)![index] = open;
}
function syncFocus() {
  const row = document.activeElement?.closest<HTMLElement>('[data-message-id]');
  focusedId.value = row && list.value?.contains(row) ? (row.dataset.messageId ?? null) : null;
}
watch(
  () => props.messages.map(message => message.id),
  ids => {
    const current = new Set(ids);
    for (const id of reasoning.keys()) if (!current.has(id)) reasoning.delete(id);
    for (const id of details.keys()) if (!current.has(id)) details.delete(id);
    if (editingId.value && !current.has(editingId.value)) cancelEdit();
    if (focusedId.value && !current.has(focusedId.value)) focusedId.value = null;
  },
);
watch(
  () => props.historyEpoch,
  () => {
    cancelEdit();
    focusedId.value = null;
    copiedId.value = null;
    reasoning.clear();
    details.clear();
  },
);
onUnmounted(() => {
  disposed = true;
  clearTimeout(copyTimeout);
});
</script>

<template>
  <section id="chat-message-list" class="chat-message-list mg-panel" aria-label="消息列表" :aria-busy="ready === false">
    <ol
      ref="list"
      class="chat-message-list__items"
      :class="{ 'chat-message-list__items--virtual': virtual }"
      :style="virtual ? { height: `${totalSize}px` } : undefined"
      @focusin="syncFocus"
      @focusout="nextTick(syncFocus)"
    >
      <li
        v-for="row in rows"
        :id="`chat-message-${row.message.id}`"
        :key="row.message.id"
        :ref="element => measure(element as Element | null)"
        class="chat-message-row"
        :data-index="row.index"
        :data-message-id="row.message.id"
        :aria-posinset="row.index + 1"
        :aria-setsize="messages.length"
        :class="{ 'chat-message-list__row--virtual': virtual }"
        :style="virtual ? { transform: `translateY(${row.start}px)` } : undefined"
      >
        <ChatMessageItem
          :message="row.message"
          :beautify-tag-name="beautifyTagName"
          :reasoning-choice="reasoning.get(row.message.id)"
          :details-choices="details.get(row.message.id)"
          :editing="editingId === row.message.id"
          :draft="editingId === row.message.id ? editDraft : ''"
          :copied="copiedId === row.message.id"
          :retry-disabled="isStoryTurnRunning"
          @copy="handleCopy(row.message)"
          @edit="startEdit(row.message)"
          @save="confirmEdit(row.message)"
          @cancel="cancelEdit"
          @retry="handleRetry(row.message)"
          @draft="editDraft = $event"
          @reasoning="reasoning.set(row.message.id, $event)"
          @detail="(index, open) => rememberDetail(row.message.id, index, open)"
        />
      </li>
    </ol>
    <div v-if="virtual && !following" class="chat-message-list__latest">
      <button class="mg-btn-action" @click="latest">↓ 回到最新</button>
    </div>
  </section>
</template>

<style scoped>
.chat-message-list__items--virtual {
  position: relative;
  display: block;
}
.chat-message-list__row--virtual {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}
.chat-message-list__latest {
  position: sticky;
  bottom: 12px;
  height: 0;
  z-index: 2;
  pointer-events: none;
}
.chat-message-list__latest button {
  font-size: 1rem;
  border-radius: var(--mg-radius-sm);
  box-shadow: 1px 1px 1px rgba(0, 0, 0, 0.2);
  transform: translateY(-100%);
  min-height: 44px;
  pointer-events: auto;
  background: var(--mg-bg-card);
}
</style>
