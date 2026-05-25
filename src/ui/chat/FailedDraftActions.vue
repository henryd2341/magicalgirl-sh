<script setup lang="ts">
const props = defineProps<{
  messageId: string;
  retryDisabled?: boolean;
  editRetryDisabled?: boolean;
  rollbackDisabled?: boolean;
}>();

const emit = defineEmits<{
  retry: [messageId: string];
  edit_retry: [messageId: string];
  rollback: [messageId: string];
}>();
</script>

<template>
  <section
    id="failed-draft-actions"
    class="failed-draft-actions scrapbook-panel"
    aria-label="失败草稿操作"
  >
    <header class="failed-draft-actions__header">
      <p class="hero-kicker-band">Recovery Mode</p>
      <h2 class="section-heading--playful">失败草稿恢复台</h2>
    </header>

    <div class="failed-draft-actions__buttons">
      <button
        id="failed-draft-retry"
        type="button"
        class="primary-cta"
        :disabled="props.retryDisabled"
        @click="emit('retry', props.messageId)"
      >
        重试本段
      </button>
      <button
        id="failed-draft-edit-retry"
        type="button"
        class="secondary-cta"
        :disabled="props.editRetryDisabled"
        @click="emit('edit_retry', props.messageId)"
      >
        编辑后重试
      </button>
      <button
        id="failed-draft-rollback"
        type="button"
        class="secondary-cta secondary-cta--warning"
        :disabled="props.rollbackDisabled"
        @click="emit('rollback', props.messageId)"
      >
        回滚到最近检查点
      </button>
    </div>
  </section>
</template>
