import { buildToolFoldHtml } from "@/orchestrator/toolResults";
const recordedContent = "霓虹雨丝挂在站台边缘。" + '<details class="chat-tool-fold"><summary>旧工具</summary>历史内容</details>' + buildToolFoldHtml([
  { tool_name: "update_variables", tool_call_id: "saved-batch", ok: true, output: { patches: [{ path: "player.money", value: 0 }, { path: "world.flags.test", value: false }, { path: "world.location.name", value: "天台" }] } },
  { tool_name: "read_skill", tool_call_id: "saved-skill", ok: true, output: { name: "夜行", content: "完整结果<&>" } },
]);
import { ChatMessageService } from "@/engine/chatMessageService";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

describe("DbChatHistoryRepository", () => {
  it("persists finalized assistant messages into the db worker-backed chat_history table and reads them back", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();

    const repository = new DbChatHistoryRepository(client);
    const service = new ChatMessageService(repository);

    await service.createAssistantProvisionalMessage({
      id: "assistant-db-001",
      requestId: "req-db-001",
      createdAt: "2026-05-21T00:00:00.000Z",
    });
    await service.appendAssistantChunk({
      messageId: "assistant-db-001",
      chunk: recordedContent,
    });
    await service.finalizeAssistantMessage({
      messageId: "assistant-db-001",
      commitAck: true,
    });

    expect(await repository.getById("assistant-db-001")).toMatchObject({
      id: "assistant-db-001",
      role: "assistant",
      content: recordedContent,
      provisional: false,
      finalized: true,
      failed: false,
    });

    expect(await repository.list()).toEqual([
      expect.objectContaining({
        id: "assistant-db-001",
        content: recordedContent,
      }),
    ]);
  });

  it("retains failed draft messages in db-backed storage for later recovery flows", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();

    const repository = new DbChatHistoryRepository(client);
    const service = new ChatMessageService(repository);

    await service.createAssistantProvisionalMessage({
      id: "assistant-db-failed",
      requestId: "req-db-failed",
      createdAt: "2026-05-21T00:00:01.000Z",
    });
    await service.appendAssistantChunk({
      messageId: "assistant-db-failed",
      chunk: "楼梯口的广播突然卡在半句。",
    });

    const failed = await service.markAssistantFailedDraft({
      messageId: "assistant-db-failed",
    });

    expect(failed).toMatchObject({
      kind: "failed_draft",
      provisional: false,
      finalized: false,
      failed: true,
    });

    expect(await repository.getById("assistant-db-failed")).toMatchObject({
      kind: "failed_draft",
      failed: true,
      content: "楼梯口的广播突然卡在半句。",
    });
  });

  it("replaces chat history atomically for checkpoint rollback", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();

    const repository = new DbChatHistoryRepository(client);
    const service = new ChatMessageService(repository);

    await service.createUserMessage({
      id: "user-before-rollback",
      content: "我在校门口停下。",
      createdAt: "2026-05-21T00:00:02.000Z",
    });
    await service.createAssistantProvisionalMessage({
      id: "assistant-after-checkpoint",
      requestId: "req-after-checkpoint",
      createdAt: "2026-05-21T00:00:03.000Z",
    });

    await repository.replaceAll([
      {
        id: "user-before-rollback",
        role: "user",
        kind: "normal",
        content: "我在校门口停下。",
        user_visible: true,
        ai_visible: true,
        provisional: false,
        finalized: true,
        failed: false,
        created_at: "2026-05-21T00:00:02.000Z",
      },
    ]);

    expect((await repository.list()).map((message) => message.id)).toEqual([
      "user-before-rollback",
    ]);
    expect(await repository.getById("assistant-after-checkpoint")).toBeNull();
  });
});
