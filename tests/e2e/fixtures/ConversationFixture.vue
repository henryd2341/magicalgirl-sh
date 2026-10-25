<script setup lang="ts">
import { computed, ref } from "vue";
import ChatMessageList from "@/ui/chat/ChatMessageList.vue";
import { useChatStore } from "@/stores/chatStore";
defineProps<{ ready: boolean }>();
const store = useChatStore();
const scroller = ref<HTMLElement | null>(null);
const visible = computed(() => store.messages.filter(m => m.user_visible));
</script>
<template>
  <main class="fixture-shell">
    <header>星见市 · 对话记录</header>
    <div ref="scroller" class="mg-game__messages fixture-scroll" tabindex="0" role="region" aria-label="对话记录">
      <div class="fixture-content">
        <ChatMessageList
          :messages="visible"
          beautify-tag-name="think"
          :scroll-element="scroller"
          virtual
          :ready="ready"
          :history-epoch="store.historyEpoch ?? 0"
        />
        <footer>失败草稿恢复区域 · 记录仍然保留</footer>
      </div>
    </div>
    <nav class="fixture-mobile" aria-label="移动端面板"><button>场景</button><button>角色</button></nav>
    <div class="fixture-input">
      <textarea aria-label="故事输入框" placeholder="你想做什么？"></textarea><button>发送</button>
    </div>
  </main>
</template>
<style>
html,
body,
#app {
  margin: 0;
  height: 100%;
}
.fixture-shell {
  height: 100dvh;
  max-width: 900px;
  margin: auto;
  display: flex;
  flex-direction: column;
  color: var(--mg-text);
  background: var(--mg-bg);
}
.fixture-shell > header {
  padding: 12px 20px;
  flex: none;
}
.fixture-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-anchor: none;
  padding: 16px 16px 76px;
}
.fixture-content {
  min-width: 0;
}
.fixture-content > footer {
  padding: 16px;
}
.fixture-input {
  padding: 12px;
  display: flex;
  gap: 12px;
  background: var(--mg-bg-card);
}
.fixture-input textarea {
  flex: 1;
  min-width: 0;
  background: var(--mg-bg-input);
  color: var(--mg-text);
}
.fixture-mobile {
  height: 0;
  align-self: flex-end;
  transform: translateY(-60px);
  display: flex;
  gap: 8px;
  z-index: 10;
  padding-right: 12px;
}
.fixture-shell button {
  min-height: 44px;
}
@media (min-width: 640px) {
  .fixture-mobile {
    display: none;
  }
}
</style>
