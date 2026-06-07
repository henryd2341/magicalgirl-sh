<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  submitMessage: [content: string];
}>();

const draft = ref("");

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submitDraft();
  }
}

function submitDraft(): void {
  const trimmed = draft.value.trim();
  if (!trimmed || props.disabled) {
    return;
  }

  emit("submitMessage", trimmed);
  draft.value = "";
}
</script>

<template>
  <section
    id="chat-input-box"
    class="chat-input-box mg-panel"
    aria-label="输入框区域"
  >
    <form class="chat-input-box__form" @submit.prevent="submitDraft">
      <textarea
        id="story-input-box"
        v-model="draft"
        class="chat-input-box__textarea"
        name="story-input"
        rows="2"
        placeholder="输入你的行动、对白或继续故事的请求……"
        :disabled="props.disabled"
        @keydown="handleKeydown"
      />
      <button
        id="chat-submit-signal"
        type="submit"
        class="mg-btn mg-btn--primary mg-glow-pink"
        :disabled="props.disabled"
      >
        发送
      </button>
    </form>
  </section>
</template>
