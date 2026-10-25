import { useChatStore } from "@/stores/chatStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("useChatStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useChatStore().resetToInMemoryPersistence();
  });

  async function streamingStore() {
    const store = useChatStore();
    await store.createUserMessage({ id: "user", content: "保留正文", createdAt: "2026-10-24" });
    await store.createAssistantProvisionalMessage({ id: "tail", requestId: "request", createdAt: "2026-10-24" });
    return store;
  }

  it("durably appends text and reasoning without reloading or replacing other rows", async () => {
    const store = await streamingStore();
    const unchanged = store.messages[0];
    const list = vi.spyOn(store.getActiveChatRuntime().repository, "list");
    await store.appendAssistantChunk({ messageId: "tail", chunk: "故事" });
    await store.appendAssistantReasoning({ messageId: "tail", chunk: "思考" });
    expect(list).not.toHaveBeenCalled();
    expect(store.messages[0]).toBe(unchanged);
    await store.refreshMessages();
    expect(store.messages).toHaveLength(2);
    expect(store.messages[1]).toMatchObject({ content: "故事", reasoning: "思考", provisional: true });
  });

  it("keeps the absent-local-id compatibility refresh and propagates failed writes", async () => {
    const store = await streamingStore();
    const repository = store.getActiveChatRuntime().repository;
    store.messages = [];
    const list = vi.spyOn(repository, "list");
    await store.appendAssistantChunk({ messageId: "tail", chunk: "恢复" });
    expect(list).toHaveBeenCalledTimes(1);
    const before = store.messages[1];
    vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(store.appendAssistantReasoning({ messageId: "tail", chunk: "失败" })).rejects.toThrow("storage unavailable");
    expect(store.messages[1]).toBe(before);
  });

  it("does not let a deferred full snapshot overwrite a newer durable chunk", async () => {
    const store = await streamingStore();
    const repository = store.getActiveChatRuntime().repository;
    const stale = await repository.list();
    let finish!: () => void;
    vi.spyOn(repository, "list").mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(stale); }));
    const refreshing = store.refreshMessages();
    await store.appendAssistantChunk({ messageId: "tail", chunk: "最新" });
    finish();
    await refreshing;
    expect(store.messages[1].content).toBe("最新");
  });

  it.each(["replacement", "runtime"])("ignores deferred stream results after %s reset", async reset => {
    const store = await streamingStore();
    const { service } = store.getActiveChatRuntime();
    const old = { ...store.messages[1], content: "旧结果" };
    let finish!: () => void;
    vi.spyOn(service, "appendAssistantChunk").mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(old); }));
    const appending = store.appendAssistantChunk({ messageId: "tail", chunk: "旧结果" });
    if (reset === "runtime") store.resetToInMemoryPersistence();
    else {
      await store.getActiveChatRuntime().repository.replaceAll([{ ...old, content: "替换内容" }]);
      await store.refreshMessages({ replaceHistory: true });
    }
    finish(); await appending;
    expect(store.messages.map(message => message.content)).toEqual(reset === "runtime" ? [] : ["替换内容"]);
  });

  it("only signals explicit history replacement, including equal length and ids", async () => {
    const store = await streamingStore();
    const epoch = store.historyEpoch;
    await store.refreshMessages();
    expect(store.historyEpoch).toBe(epoch);
    await store.refreshMessages({ replaceHistory: true });
    expect(store.historyEpoch).toBe(epoch + 1);
  });

  it("creates and streams an assistant provisional message, then finalizes it after commitAck", async () => {
    const store = useChatStore();

    const provisional = await store.createAssistantProvisionalMessage({
      id: "assistant-store-001",
      requestId: "req-store-001",
      createdAt: "2026-05-20T00:00:00.000Z",
    });

    expect(provisional).toMatchObject({
      id: "assistant-store-001",
      provisional: true,
      finalized: false,
      failed: false,
    });

    await store.appendAssistantChunk({
      messageId: "assistant-store-001",
      chunk: "霓虹色的风铃在栏杆边轻响。",
    });

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      content: "霓虹色的风铃在栏杆边轻响。",
      provisional: true,
      finalized: false,
    });

    const finalized = await store.finalizeAssistantMessage({
      messageId: "assistant-store-001",
      commitAck: true,
    });

    expect(finalized).toMatchObject({
      provisional: false,
      finalized: true,
      failed: false,
    });
    expect(store.messages[0].finalized).toBe(true);
  });

  it("keeps failed drafts visible in store state for recovery actions", async () => {
    const store = useChatStore();

    await store.createAssistantProvisionalMessage({
      id: "assistant-store-failed",
      requestId: "req-store-failed",
      createdAt: "2026-05-20T00:00:01.000Z",
    });
    await store.appendAssistantChunk({
      messageId: "assistant-store-failed",
      chunk: "楼道尽头的灯闪了一下。",
    });

    const failedDraft = await store.markAssistantFailedDraft({
      messageId: "assistant-store-failed",
    });

    expect(failedDraft).toMatchObject({
      kind: "failed_draft",
      failed: true,
      finalized: false,
    });

    expect(store.messages[0]).toMatchObject({
      kind: "failed_draft",
      failed: true,
      content: "楼道尽头的灯闪了一下。",
    });
  });
});
