import { buildToolFoldHtml } from "@/orchestrator/toolResults";
const recordedContent = "我把存档护符握紧。" + '<details class="chat-tool-fold"><summary>旧工具</summary>历史内容</details>' + buildToolFoldHtml([
  { tool_name: "update_variables", tool_call_id: "saved-batch", ok: true, output: { patches: [{ path: "player.money", value: 0 }, { path: "world.flags.test", value: false }, { path: "world.location.name", value: "天台" }] } },
  { tool_name: "read_skill", tool_call_id: "saved-skill", ok: true, output: { name: "夜行", content: "完整结果<&>" } },
]);
import {
  createFullSaveExport,
  type FullSaveExportV3,
} from "@/persistence/exportSave";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { DbCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { DbEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import { DbSaveMetaRepository } from "@/persistence/repositories/saveMetaRepository";
import {
  DbVariableChangeLogRepository,
  DbVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { VariableEngine } from "@/engine/variableEngine";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

describe("full save export", () => {
  it("creates a save checkpoint, stores save metadata, and exports all recovery and context tables", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const checkpointRepository = new DbCheckpointRepository(client);
    const eventLogRepository = new DbEventLogRepository(client);
    const saveMetaRepository = new DbSaveMetaRepository(client);
    const chatRepository = new DbChatHistoryRepository(client);
    const variableRepository = new DbVariableRepository(client);
    const variableChangeLogRepository = new DbVariableChangeLogRepository(client);
    const worldInfoRepository = new DbWorldInfoRepository(client);
    const variableValue = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-export-current",
      stateHash: "hash-export-current",
      updatedAt: "2026-05-25T01:12:00.000Z",
    };

    await chatRepository.save({
      id: "msg-export-seed",
      role: "user",
      kind: "normal",
      content: recordedContent,
      user_visible: true,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-25T01:11:00.000Z",
    });
    await variableRepository.saveCurrent(variableValue);
    await variableChangeLogRepository.append({
      id: "change-export-seed",
      rootId: "root-export-current",
      requestId: "req-export-seed",
      toolCallId: "tool-export-seed",
      contextVersion: 7,
      stateHashBefore: "hash-before-export",
      stateHashAfter: "hash-export-current",
      patches: [{ path: "player.money", value: 180 }],
      createdAt: "2026-05-25T01:11:30.000Z",
    });
    await worldInfoRepository.save({
      id: "wi-export-rooftop",
      keywords: ["存档", "护符"],
      content: "存档护符会记录当前世界线。",
      priority: 90,
      enabled: true,
      isConstant: false,
    });
    await eventLogRepository.append({
      id: "event-export-seed",
      type: "RequestStarted",
      createdAt: "2026-05-25T01:10:00.000Z",
      source: "test",
      payload: {
        requestId: "req-export-seed",
      },
    });

    const result = await createFullSaveExport({
      repositories: {
        checkpointRepository,
        eventLogRepository,
        saveMetaRepository,
        chatRepository,
        variableRepository,
        variableChangeLogRepository,
        worldInfoRepository,
      },
      getSessionSnapshot: () => ({
        sessionState: "IDLE",
        pipelineState: null,
        activeRequestId: null,
      }),
      getPendingBattle: () => null,
      getActiveBattle: () => null,
      idFactory: {
        exportId: () => "export-full-001",
        checkpointId: () => "checkpoint-save-export-001",
        eventId: () => "event-checkpoint-save-export-001",
        saveMetaId: () => "save-meta-export-001",
      },
      now: () => "2026-05-25T01:12:03.000Z",
    });

    expect(result.fileName).toBe("magicalgirl-sh-save-20260525-011203.json");
    expect(result.exportRecord).toEqual({
      id: "save-meta-export-001",
      label: "手动导出 2026-05-25 01:12:03",
      createdAt: "2026-05-25T01:12:03.000Z",
      updatedAt: "2026-05-25T01:12:03.000Z",
      checkpointId: "checkpoint-save-export-001",
    });

    const parsed = JSON.parse(result.jsonText) as FullSaveExportV3;
    expect(parsed).toMatchObject({
      format: "magicalgirl-sh.full-save-export",
      version: 3,
      exportedAt: "2026-05-25T01:12:03.000Z",
      exportId: "export-full-001",
      createdCheckpointId: "checkpoint-save-export-001",
      saveMetaId: "save-meta-export-001",
    });
    expect(parsed).not.toHaveProperty("testRecords");
    expect(parsed.data).not.toHaveProperty("chatMessages");
    expect(parsed.data.messagePool).toHaveLength(1);
    expect(parsed.data.chatMessageRefs).toEqual([0]);
    expect(parsed.data.checkpointSnapshots[0]?.chatMessageRefs).toEqual([0]);
    expect(parsed.data.checkpointSnapshots[0]).not.toHaveProperty("chatMessages");
    expect(parsed.data.messagePool).toContainEqual(
      expect.objectContaining({
        id: "msg-export-seed",
        content: recordedContent,
      }),
    );
    expect(parsed.data.variableValue).toMatchObject({
      rootId: "root-export-current",
      stateHash: "hash-export-current",
    });
    expect(parsed.data.variableChangeLog).toContainEqual(
      expect.objectContaining({
        id: "change-export-seed",
      }),
    );
    expect(parsed.data.worldInfo).toContainEqual(
      expect.objectContaining({
        id: "wi-export-rooftop",
        isConstant: false,
      }),
    );
    expect(parsed.data.eventLog.map((event) => event.type)).toEqual([
      "RequestStarted",
      "CheckpointCreated",
    ]);
    expect(parsed.data.checkpointSnapshots).toContainEqual(
      expect.objectContaining({
        id: "checkpoint-save-export-001",
        kind: "save_checkpoint",
        reason: "manual_save_export",
        metadata: expect.objectContaining({
          exportId: "export-full-001",
          manualExport: true,
        }),
      }),
    );
    expect(parsed.data.saveMeta).toContainEqual(result.exportRecord);
    expect(await checkpointRepository.getLatestByKind("save_checkpoint"))
      .toMatchObject({
        id: "checkpoint-save-export-001",
      });
    expect(await saveMetaRepository.list()).toContainEqual(result.exportRecord);
  });

  it("exports an initial variable record when no current variables were saved manually", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const checkpointRepository = new DbCheckpointRepository(client);
    const eventLogRepository = new DbEventLogRepository(client);
    const saveMetaRepository = new DbSaveMetaRepository(client);
    const chatRepository = new DbChatHistoryRepository(client);
    const variableRepository = new DbVariableRepository(client);
    const variableChangeLogRepository = new DbVariableChangeLogRepository(client);
    const worldInfoRepository = new DbWorldInfoRepository(client);

    const result = await createFullSaveExport({
      repositories: {
        checkpointRepository,
        eventLogRepository,
        saveMetaRepository,
        chatRepository,
        variableRepository,
        variableChangeLogRepository,
        worldInfoRepository,
      },
      getSessionSnapshot: () => ({
        sessionState: "IDLE",
        pipelineState: null,
        activeRequestId: null,
      }),
      getPendingBattle: () => null,
      getActiveBattle: () => null,
      idFactory: {
        exportId: () => "export-full-initial-variables",
        checkpointId: () => "checkpoint-save-export-initial-variables",
        eventId: () => "event-checkpoint-save-export-initial-variables",
        saveMetaId: () => "save-meta-export-initial-variables",
      },
      now: () => "2026-05-25T13:02:00.000Z",
    });

    const parsed = JSON.parse(result.jsonText) as FullSaveExportV3;
    expect(parsed.data.variableValue).toMatchObject({
      rootId: "game_variables_root",
      stateHash: "initial",
      updatedAt: "2026-05-25T13:02:00.000Z",
    });
    expect(parsed.data.checkpointSnapshots).toContainEqual(
      expect.objectContaining({
        id: "checkpoint-save-export-initial-variables",
        variableValue: expect.objectContaining({
          rootId: "game_variables_root",
          stateHash: "initial",
        }),
      }),
    );
    await expect(variableRepository.getCurrent()).resolves.toMatchObject({
      rootId: "game_variables_root",
      stateHash: "initial",
    });
  });

  it("exports training progress while removing an active training runtime snapshot", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const checkpointRepository = new DbCheckpointRepository(client);
    const eventLogRepository = new DbEventLogRepository(client);
    const saveMetaRepository = new DbSaveMetaRepository(client);
    const chatRepository = new DbChatHistoryRepository(client);
    const variableRepository = new DbVariableRepository(client);
    const variableChangeLogRepository = new DbVariableChangeLogRepository(client);
    const worldInfoRepository = new DbWorldInfoRepository(client);
    const variableValue = new VariableEngine().createInitialState();
    variableValue.root.training = {
      clearedChallengeIds: ["trial-1"],
      claimedRewardIds: ["trial-1"],
      hiddenChallengeDiscovered: false,
    };
    await variableRepository.saveCurrent(variableValue);

    const result = await createFullSaveExport({
      repositories: {
        checkpointRepository,
        eventLogRepository,
        saveMetaRepository,
        chatRepository,
        variableRepository,
        variableChangeLogRepository,
        worldInfoRepository,
      },
      getSessionSnapshot: () => ({
        sessionState: "IN_COMBAT",
        pipelineState: null,
        activeRequestId: null,
      }),
      getPendingBattle: () => null,
      getActiveBattle: () => ({
        lifecycleState: "ACTIVE",
        phase: "PLAYER_TURN",
        encounterId: "training/challenge/trial-2/export",
        source: "training/challenge",
        participants: [],
        pressTurn: { ownerSide: "player", icons: [] },
      }),
      idFactory: {
        exportId: () => "export-training-progress",
        checkpointId: () => "checkpoint-training-progress",
        eventId: () => "event-training-progress",
        saveMetaId: () => "save-meta-training-progress",
      },
      now: () => "2026-07-13T12:30:00.000Z",
    });

    const parsed = JSON.parse(result.jsonText) as FullSaveExportV3;
    expect(parsed.data.variableValue?.root.training).toEqual({
      clearedChallengeIds: ["trial-1"],
      claimedRewardIds: ["trial-1"],
      hiddenChallengeDiscovered: false,
    });
    const checkpoint = parsed.data.checkpointSnapshots.find(
      (entry) => entry.id === "checkpoint-training-progress",
    );
    expect(checkpoint).toMatchObject({
      sessionSnapshot: { sessionState: "IDLE" },
      variableValue: {
        root: {
          training: {
            clearedChallengeIds: ["trial-1"],
          },
        },
      },
    });
    expect(checkpoint?.pendingBattle).toBeUndefined();
    expect(checkpoint?.activeBattle).toBeUndefined();
  });

});
