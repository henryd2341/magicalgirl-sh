import { createApp, h, KeepAlive, nextTick, ref } from "vue";
import { createPinia } from "pinia";
import MarkdownIt from "markdown-it";
import { useChatStore } from "@/stores/chatStore";
import ConversationFixture from "./ConversationFixture.vue";
import { conversationMessages } from "./conversation-data";
import "@/styles/index.scss";
import "@/styles/tailwind.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "e-girl";
const pinia = createPinia();
const store = useChatStore(pinia);
const ready = ref(false);
const active = ref(true);
let renders = 0;
let lists = 0;
const originalRender = MarkdownIt.prototype.render;
MarkdownIt.prototype.render = function (...args) {
  renders++;
  return originalRender.apply(this, args);
};
const repository = store.getActiveChatRuntime().repository;
const list = repository.list.bind(repository);
repository.list = () => {
  lists++;
  return list();
};
const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const fixture = {
  store,
  async activate(value: boolean) {
    active.value = value;
    await nextTick();
    await paint();
  },
  async reset(count: number, prefix = "fixture") {
    ready.value = false;
    await repository.replaceAll(conversationMessages(count, prefix));
    renders = 0;
    lists = 0;
    const start = performance.now();
    await store.refreshMessages({ replaceHistory: true });
    ready.value = true;
    await nextTick();
    await paint();
    return { ms: performance.now() - start, ...fixture.metrics() };
  },
  async stream(reasoning = false) {
    const id = store.messages.at(-1)?.id;
    if (!id) return;
    const before = { renders, lists };
    const start = performance.now();
    await (reasoning ? store.appendAssistantReasoning : store.appendAssistantChunk)({
      messageId: id,
      chunk: "\n\n风铃轻响，新的故事正在继续。".repeat(4),
    });
    await nextTick();
    await paint();
    return { ms: performance.now() - start, renders: renders - before.renders, lists: lists - before.lists };
  },
  metrics() {
    const element = document.querySelector<HTMLElement>(".fixture-scroll")!;
    return {
      renders,
      lists,
      rows: document.querySelectorAll(".chat-message-card").length,
      nodes: element.querySelectorAll("*").length,
      bytes: new TextEncoder().encode(JSON.stringify(store.messages)).length,
      bottom: element.scrollHeight - element.clientHeight - element.scrollTop,
    };
  },
};
declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    conversationFixture: typeof fixture;
  }
}
Object.assign(window, { conversationFixture: fixture });
createApp({
  render: () =>
    h(KeepAlive, null, { default: () => (active.value ? h(ConversationFixture, { ready: ready.value }) : null) }),
})
  .use(pinia)
  .mount("#app");
setTimeout(() => void fixture.reset(Number(params.get("count") ?? 100)), Number(params.get("delay") ?? 0));
