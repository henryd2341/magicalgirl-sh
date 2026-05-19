import { useChatStore } from "@/stores/chatStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

describe("useChatStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
