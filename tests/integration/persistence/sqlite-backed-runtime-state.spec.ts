import { ChatMessageService } from "@/engine/chatMessageService";
import { VariableEngine } from "@/engine/variableEngine";
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
import { createSharedRawSqliteFactory } from "../../helpers/sharedRawSqlite";
import { describe, expect, it } from "vitest";

describe("sqlite-backed runtime state", () => {
  it("reloads chat, variables, variable logs, and runtime snapshot after worker recreation", async () => {
    const sqlite3Factory = createSharedRawSqliteFactory();
    const firstClient = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(
        createDbWorkerRuntime({
          storage: "memory",
          sqlite3Factory,
        }),
      ),
    );
    await firstClient.initialize();

    const firstChatRepository = new DbChatHistoryRepository(firstClient);
    const firstChatService = new ChatMessageService(firstChatRepository);
    const firstVariableRepository = new DbVariableRepository(firstClient);
    const firstVariableLogRepository =
      new DbVariableChangeLogRepository(firstClient);
    const firstRuntimeRepository = new DbRuntimeSnapshotRepository(firstClient);

    await firstChatService.createUserMessage({
      id: "msg-runtime-persisted",
      content: "我把伞收起来，站在走廊尽头。",
      createdAt: "2026-05-26T00:00:00.000Z",
    });
    await firstVariableRepository.saveCurrent({
      ...new VariableEngine().createInitialState(),
      version: 2,
      stateHash: "hash-runtime-persisted",
      updatedAt: "2026-05-26T00:00:01.000Z",
      root: {
        ...new VariableEngine().createInitialState().root,
        world: {
          ...new VariableEngine().createInitialState().root.world,
          location: {
            id: "school_corridor",
            name: "旧校舍走廊",
            description: "窗外还在下雨。",
          },
        },
      },
    });
    await firstVariableLogRepository.append({
      id: "change-runtime-persisted",
      rootId: "game_variables_root",
      requestId: "req-runtime-persisted",
      toolCallId: "tool-runtime-persisted",
      contextVersion: 1,
      stateHashBefore: "initial",
      stateHashAfter: "hash-runtime-persisted",
      patches: [
        {
          path: "world.location.name",
          value: "旧校舍走廊",
        },
      ],
      createdAt: "2026-05-26T00:00:02.000Z",
    });
    await firstRuntimeRepository.saveCurrent({
      id: "current",
      updatedAt: "2026-05-26T00:00:03.000Z",
      sessionSnapshot: {
        sessionState: "POST_COMBAT_READY",
        pipelineState: null,
        activeRequestId: null,
      },
      pendingBattle: null,
      activeBattle: null,
    });

    const secondClient = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(
        createDbWorkerRuntime({
          storage: "memory",
          sqlite3Factory,
        }),
      ),
    );
    await secondClient.initialize();

    await expect(new DbChatHistoryRepository(secondClient).list()).resolves.toEqual([
      expect.objectContaining({
        id: "msg-runtime-persisted",
        content: "我把伞收起来，站在走廊尽头。",
      }),
    ]);
    await expect(new DbVariableRepository(secondClient).getCurrent()).resolves.toMatchObject({
      stateHash: "hash-runtime-persisted",
      root: {
        world: {
          location: expect.objectContaining({
            name: "旧校舍走廊",
          }),
        },
      },
    });
    await expect(
      new DbVariableChangeLogRepository(secondClient).list(),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "change-runtime-persisted",
      }),
    ]);
    await expect(
      new DbRuntimeSnapshotRepository(secondClient).getCurrent(),
    ).resolves.toMatchObject({
      sessionSnapshot: {
        sessionState: "POST_COMBAT_READY",
      },
    });
  });
});
