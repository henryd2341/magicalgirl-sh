import { VariableEngine } from "@/engine/variableEngine";
import { renderOpeningMessage } from "@/content/openingMessage";
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
    const vars = await variableRepository.getCurrent();
    expect(vars?.root.player.flags.isNewTransfer).toBe(true);
    expect(vars?.root.player.relationships["佐仓真央"]).toBe(50);
    expect(Object.keys(vars!.root.characters)).toHaveLength(8);
    expect(vars?.root.characters["佐仓真央"].inParty).toBe(true);
    expect(vars?.root.characters["青井霞"].combat).toBeNull();
    await expect(client.listSaveSlots()).resolves.toEqual([
      expect.objectContaining({
        id: "slot-preserved",
      }),
    ]);
  });
});

  it("injects the opening message as a finalized assistant message after new game variables are written", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const chatRepository = new DbChatHistoryRepository(client);
    const variableRepository = new DbVariableRepository(client);

    await client.resetCurrentGameData({
      now: "2026-09-15T08:20:00.000Z",
    });

    const engine = new VariableEngine();
    const current = (await variableRepository.getCurrent()) ?? engine.createInitialState();
    const result = engine.applyPatchSet({
      current,
      envelope: {
        request_id: "new-game-test",
        context_version: 1,
        state_hash: current.stateHash,
        tool_call_id: "new-game-test-profile",
        patches: [
          { path: "player.profile.name", value: "鹿目真昼" },
          { path: "player.profile.gender", value: "女" },
        ],
      },
    });
    await variableRepository.saveCurrent(result.next);

    const openingMessage = renderOpeningMessage({
      playerName: "鹿目真昼",
      playerGender: "女",
      now: "2026-09-15T08:20:30.000Z",
    });
    await chatRepository.save(openingMessage);

    const messages = await chatRepository.list();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "msg-opening-ceremony",
      role: "assistant",
      kind: "normal",
      finalized: true,
      failed: false,
      provisional: false,
      user_visible: true,
      ai_visible: true,
      created_at: "2026-09-15T08:20:30.000Z",
    });
    expect(messages[0].content).toContain("鹿目真昼");
    expect(messages[0].content).toContain("佐仓真央");
  });
