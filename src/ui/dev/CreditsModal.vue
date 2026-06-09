<script setup lang="ts">
import { renderMarkdown } from "@/composables/useMarkdown";
import { computed, onMounted, ref } from "vue";

defineEmits<{ close: [] }>();

const raw = ref("");
const rendered = computed(() => renderMarkdown(raw.value));

onMounted(async () => {
  const modules = import.meta.glob("../../assets/Credits.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const key = Object.keys(modules)[0];
  if (key) raw.value = modules[key];
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}
</script>

<template>
  <div
    class="mg-modal-overlay"
    @click.self="$emit('close')"
    @keydown="onKeydown"
  >
    <div class="mg-modal-card mg-modal-card--wide credits-modal">
      <button class="mg-modal__close" @click="$emit('close')">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title"><i class="fas fa-scroll"></i> Attribution</h2>
      <div class="mg-modal__body mg-scroll credits-modal__body">
        <div v-if="!raw" class="credits-modal__loading">加载中…</div>
        <div v-else class="credits-modal__content" v-html="rendered" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.credits-modal {
  max-width: 720px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.credits-modal__body {
  flex: 1;
  min-height: 0;
}

.credits-modal__loading {
  text-align: center;
  padding: var(--mg-space-xl, 24px);
  color: var(--mg-text-secondary);
}

.credits-modal__content {
  color: var(--mg-text);

  // ── base links ──
  :deep(a) {
    color: var(--mg-accent, #ff6b9d);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }

  // ── headings ──
  :deep(h1) {
    font-family: var(--mg-font-heading);
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--mg-accent);
    margin: 0 0 var(--mg-space-lg, 16px);
    padding-bottom: var(--mg-space-sm, 8px);
    border-bottom: 2px solid var(--mg-border, rgba(255, 255, 255, 0.1));

    a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }

  :deep(h2) {
    font-family: var(--mg-font-heading);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--mg-text);
    margin: var(--mg-space-lg, 16px) 0 var(--mg-space-sm, 8px);
  }

  :deep(h3) {
    font-family: var(--mg-font-heading);
    font-size: 1rem;
    font-weight: 700;
    color: var(--mg-accent, #ff6b9d);
    margin: var(--mg-space-md, 12px) 0 var(--mg-space-xs, 6px);

    a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }

  :deep(h4) {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--mg-text-secondary);
    margin: var(--mg-space-sm, 8px) 0 var(--mg-space-xxs, 4px);

    a {
      color: inherit;
    }
  }

  :deep(h5) {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--mg-text-muted, rgba(255, 255, 255, 0.45));
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: var(--mg-space-sm, 8px) 0 var(--mg-space-xxs, 4px);
  }

  // ── body ──
  :deep(p),
  :deep(ul),
  :deep(ol) {
    margin: var(--mg-space-xs, 6px) 0;
    line-height: 1.7;
  }

  :deep(ul) {
    padding-left: 1.2em;
    list-style: none;

    li {
      position: relative;
      padding-left: 0.6em;
      margin: 2px 0;
      font-size: 0.9rem;

      &::before {
        content: "—";
        position: absolute;
        left: -1em;
        color: var(--mg-text-muted, rgba(255, 255, 255, 0.35));
      }
    }
  }

  // ── inline code (track IDs like #battle/001) ──
  :deep(code) {
    padding: 0.1em 0.35em;
    background: var(--mg-bg-input, rgba(0, 0, 0, 0.15));
    border-radius: var(--mg-radius-sm, 4px);
    font-family: var(--mg-font-mono, monospace);
    font-size: 0.82em;
    color: var(--mg-accent, #ff6b9d);
    white-space: nowrap;
  }
}
</style>
