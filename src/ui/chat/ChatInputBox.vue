<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  submitMessage: [content: string];
}>();

const draft = ref("");

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
    class="chat-input-box scrapbook-panel"
    aria-label="输入框区域"
  >
    <header class="chat-input-box__header">
      <p class="hero-kicker-band">Prompt Window</p>
      <h2 class="section-heading--playful">续写输入台</h2>
    </header>

    <form class="chat-input-box__form" @submit.prevent="submitDraft">
      <label class="chat-input-box__label" for="story-input-box"
        >故事输入框</label
      >
      <textarea
        id="story-input-box"
        v-model="draft"
        class="chat-input-box__textarea"
        name="story-input"
        rows="4"
        placeholder="输入你的行动、对白或继续故事的请求……"
        :disabled="props.disabled"
      />
      <div class="chat-input-box__actions">
        <button
          id="chat-submit-signal"
          type="submit"
          class="primary-cta"
          :disabled="props.disabled"
        >
          发送讯号
        </button>
      </div>
    </form>
  </section>
</template>
