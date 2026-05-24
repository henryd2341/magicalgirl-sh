import { ChatMessageService } from "@/engine/chatMessageService";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { describe, expect, it } from "vitest";

describe("ChatMessageService", () => {
  it("persists user messages as finalized records immediately", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new ChatMessageService(repository);

    const message = await service.createUserMessage({
      id: "user-001",
      content: "我推开天台的门。",
      createdAt: "2026-05-19T00:00:00.000Z",
    });

    expect(message).toMatchObject({
      id: "user-001",
      role: "user",
      kind: "normal",
      content: "我推开天台的门。",
      user_visible: true,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-19T00:00:00.000Z",
    });

    expect(await repository.list()).toEqual([message]);
  });

  it("can persist hidden user messages that remain visible to AI context", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new ChatMessageService(repository);

    const message = await service.createUserMessage({
      id: "user-hidden-ai-visible",
      content: "请根据最近的战斗摘要继续剧情。",
      userVisible: false,
      aiVisible: true,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(message).toMatchObject({
      id: "user-hidden-ai-visible",
      role: "user",
      kind: "normal",
      content: "请根据最近的战斗摘要继续剧情。",
      user_visible: false,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-24T00:00:00.000Z",
    });
    expect(await repository.list()).toEqual([message]);
  });

  it("creates provisional assistant messages and appends streamed chunks before commitAck", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new ChatMessageService(repository);

    const provisional = await service.createAssistantProvisionalMessage({
      id: "assistant-001",
      requestId: "req-001",
      createdAt: "2026-05-19T00:00:01.000Z",
    });

    expect(provisional).toMatchObject({
      id: "assistant-001",
      role: "assistant",
      kind: "normal",
      content: "",
      provisional: true,
      finalized: false,
      failed: false,
      request_id: "req-001",
    });

    await service.appendAssistantChunk({
      messageId: "assistant-001",
      chunk: "夜风像玻璃纸一样",
    });
    await service.appendAssistantChunk({
      messageId: "assistant-001",
      chunk: "擦过你的发梢。",
    });

    const stored = await repository.getById("assistant-001");
    expect(stored).toMatchObject({
      content: "夜风像玻璃纸一样擦过你的发梢。",
      provisional: true,
      finalized: false,
      failed: false,
    });
  });

  it("finalizes assistant messages only after commitAck is received", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new ChatMessageService(repository);

    await service.createAssistantProvisionalMessage({
      id: "assistant-ack",
      requestId: "req-ack",
      createdAt: "2026-05-19T00:00:02.000Z",
    });
    await service.appendAssistantChunk({
      messageId: "assistant-ack",
      chunk: "你听见楼梯间传来脚步声。",
    });

    await expect(
      service.finalizeAssistantMessage({
        messageId: "assistant-ack",
        commitAck: false,
      }),
    ).rejects.toThrow(
      "[CHAT_COMMIT_ACK_REQUIRED] Assistant message cannot finalize before commitAck.",
    );

    const finalized = await service.finalizeAssistantMessage({
      messageId: "assistant-ack",
      commitAck: true,
    });

    expect(finalized).toMatchObject({
      provisional: false,
      finalized: true,
      failed: false,
      kind: "normal",
    });
  });

  it("converts interrupted assistant messages into failed_draft records that remain visible for recovery", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new ChatMessageService(repository);

    await service.createAssistantProvisionalMessage({
      id: "assistant-failed",
      requestId: "req-failed",
      createdAt: "2026-05-19T00:00:03.000Z",
    });
    await service.appendAssistantChunk({
      messageId: "assistant-failed",
      chunk: "门后的气息忽然变得不对劲。",
    });

    const failedDraft = await service.markAssistantFailedDraft({
      messageId: "assistant-failed",
    });

    expect(failedDraft).toMatchObject({
      role: "assistant",
      kind: "failed_draft",
      provisional: false,
      finalized: false,
      failed: true,
      user_visible: true,
    });
  });

  it("persists battle summary system messages without changing assistant lifecycle state", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new ChatMessageService(repository);

    const messages = await service.createBattleSummaryMessages([
      {
        id: "summary-default",
        level: "default",
        content: "Victory\nTurns: 2",
        userVisible: true,
        aiVisible: false,
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      {
        id: "summary-minimal",
        level: "minimal",
        content: "outcome: victory",
        userVisible: false,
        aiVisible: true,
        createdAt: "2026-05-24T00:00:00.000Z",
      },
    ]);

    expect(messages).toEqual([
      {
        id: "summary-default",
        role: "system",
        kind: "battle_summary",
        summary_level: "default",
        content: "Victory\nTurns: 2",
        user_visible: true,
        ai_visible: false,
        provisional: false,
        finalized: true,
        failed: false,
        created_at: "2026-05-24T00:00:00.000Z",
      },
      {
        id: "summary-minimal",
        role: "system",
        kind: "battle_summary",
        summary_level: "minimal",
        content: "outcome: victory",
        user_visible: false,
        ai_visible: true,
        provisional: false,
        finalized: true,
        failed: false,
        created_at: "2026-05-24T00:00:00.000Z",
      },
    ]);
    expect(await repository.list()).toEqual(messages);
  });
});
