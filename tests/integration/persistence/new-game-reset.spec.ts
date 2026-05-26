import { VariableEngine } from "@/engine/variableEngine";
import type { FullSaveExportV1 } from "@/persistence/exportSave";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { DbRuntimeSnapshotRepository } from "@/persistence/repositories/runtimeSnapshotRepository";
import {
  DbVariableChangeLogRepository,
  DbVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

function createSlotPayload(): FullSaveExportV1 {
  const variableValue = {
    ...new VariableEngine().createInitialState(),
    rootId: "root-slot-preserved",
    stateHash: "hash-slot-preserved",
    updatedAt: "2026-05-26T01:00:00.000Z",
  };

  return {
    format: "magicalgirl-sh.full-save-export",
    version: 1,
    exportedAt: "2026-05-26T01:01:00.000Z",
    exportId: "export-slot-preserved",
    createdCheckpointId: "checkpoint-slot-preserved",
    saveMetaId: "save-meta-slot-preserved",
    data: {
      checkpointSnapshots: [
        {
          id: "checkpoint-slot-preserved",
          kind: "save_checkpoint",
          snapshotVersion: 1,
          createdAt: "2026-05-26T01:01:00.000Z",
          reason: "manual_save_export",
          sessionSnapshot: {
            sessionState: "IDLE",
            pipelineState: null,
            activeRequestId: null,
          },
          variableValue,
          chatMessages: [],
        },
      ],
      saveMeta: [
        {
          id: "save-meta-slot-preserved",
          label: "保留的导入槽位",
          createdAt: "2026-05-26T01:01:00.000Z",
          updatedAt: "2026-05-26T01:01:00.000Z",
          checkpointId: "checkpoint-slot-preserved",
        },
      ],
      eventLog: [],
      chatMessages: [],
      variableValue,
      variableChangeLog: [],
      worldInfo: [],
    },
  };
}

describe("new game current runtime reset", () => {
  it("clears current game tables while preserving imported save slots", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const chatRepository = new DbChatHistoryRepository(client);
    const variableRepository = new DbVariableRepository(client);
    const variableChangeLogRepository = new DbVariableChangeLogRepository(
      client,
    );
    const runtimeSnapshotRepository = new DbRuntimeSnapshotRepository(client);

    await chatRepository.save({
      id: "msg-before-new-game",
      role: "user",
      kind: "normal",
      content: "旧存档内容。",
      user_visible: true,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-26T01:02:00.000Z",
    });
    await variableRepository.saveCurrent({
      ...new VariableEngine().createInitialState(),
      rootId: "root-before-new-game",
      stateHash: "hash-before-new-game",
      updatedAt: "2026-05-26T01:02:00.000Z",
    });
    await variableChangeLogRepository.append({
      id: "change-before-new-game",
      rootId: "root-before-new-game",
      requestId: "req-before-new-game",
      toolCallId: "tool-before-new-game",
      contextVersion: 1,
      stateHashBefore: "initial",
      stateHashAfter: "hash-before-new-game",
      patches: [{ path: "world.location.name", value: "旧地点" }],
      createdAt: "2026-05-26T01:03:00.000Z",
    });
    await runtimeSnapshotRepository.saveCurrent({
      id: "current",
      updatedAt: "2026-05-26T01:04:00.000Z",
      sessionSnapshot: {
        sessionState: "POST_COMBAT_READY",
        pipelineState: null,
        activeRequestId: null,
      },
      pendingBattle: null,
      activeBattle: null,
    });
    await client.saveSaveSlot({
      id: "slot-preserved",
      sourceFileName: "preserved-slot.json",
      importedAt: "2026-05-26T01:05:00.000Z",
      exportedAt: "2026-05-26T01:01:00.000Z",
      exportId: "export-slot-preserved",
      createdCheckpointId: "checkpoint-slot-preserved",
      saveMetaId: "save-meta-slot-preserved",
      label: "保留的导入槽位",
      payload: createSlotPayload(),
    });

    await client.resetCurrentGameData({
      now: "2026-05-26T01:06:00.000Z",
    });

    await expect(chatRepository.list()).resolves.toEqual([]);
    await expect(variableChangeLogRepository.list()).resolves.toEqual([]);
    await expect(runtimeSnapshotRepository.getCurrent()).resolves.toMatchObject({
      sessionSnapshot: {
        sessionState: "IDLE",
      },
      pendingBattle: null,
      activeBattle: null,
    });
    await expect(variableRepository.getCurrent()).resolves.toMatchObject({
      stateHash: "initial",
      updatedAt: "2026-05-26T01:06:00.000Z",
    });
    await expect(client.listSaveSlots()).resolves.toEqual([
      expect.objectContaining({
        id: "slot-preserved",
      }),
    ]);
  });
});
