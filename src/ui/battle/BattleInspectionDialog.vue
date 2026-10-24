<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{ title: string }>();
defineOptions({ inheritAttrs: false });
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Tab" || !dialog.value) return;
  const controls = [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]')];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

onMounted(async () => {
  dialog.value?.showModal();
  await nextTick();
  closeButton.value?.focus();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  if (trigger?.isConnected) trigger.focus();
});
</script>

<template>
  <Teleport to="body">
    <dialog
      v-bind="$attrs"
      ref="dialog"
      class="mg-modal-card battle-inspection-dialog"
      :aria-label="title"
      aria-modal="true"
      @cancel.prevent="emit('close')"
      @click.self="emit('close')"
      @keydown.stop="onKeydown"
    >
      <header class="battle-inspection-dialog__header">
        <h2 class="mg-modal__title">{{ title }}</h2>
        <button
          ref="closeButton"
          type="button"
          class="mg-modal__close"
          :aria-label="`关闭${title}`"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <div class="mg-modal__body"><slot /></div>
    </dialog>
  </Teleport>
</template>
