/* eslint-disable no-undef, no-unused-vars */

import {
  createBrowserDbWorkerEndpoint,
  type BrowserDbWorkerLike,
} from "@/persistence/dbClient";
import type { CheckpointSnapshotRecord } from "@/types/recovery";
import { reactive } from "vue";
import { describe, expect, it } from "vitest";

class StructuredCloneWorker implements BrowserDbWorkerLike {
  private listener: ((event: { data: unknown }) => void) | null = null;

  public postedMessage: unknown = null;

  public postMessage(message: unknown): void {
    this.postedMessage = structuredClone(message);
    const id = (this.postedMessage as { id: string }).id;
    queueMicrotask(() => {
      this.listener?.({
        data: {
          id,
          response: {
            type: "save_checkpoint_snapshot_result",
            payload: {
              savedId: "checkpoint-reactive",
            },
          },
        },
      });
    });
  }

  public addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void {
    if (type === "message") {
      this.listener = listener;
    }
  }

  public removeEventListener(): void {
    this.listener = null;
  }
}

describe("createBrowserDbWorkerEndpoint", () => {
  it("strips Vue proxies before posting requests to a real Worker boundary", async () => {
    const worker = new StructuredCloneWorker();
    const endpoint = createBrowserDbWorkerEndpoint(worker);
    const checkpoint = reactive<CheckpointSnapshotRecord>({
      id: "checkpoint-reactive",
      kind: "save_checkpoint",
      snapshotVersion: 1,
      createdAt: "2026-05-25T12:00:00.000Z",
      reason: "manual_save_export",
      sessionSnapshot: {
        sessionState: "IDLE",
        pipelineState: null,
        activeRequestId: null,
      },
      variableValue: null,
      chatMessages: [],
    });

    await expect(
      endpoint.post({
        type: "save_checkpoint_snapshot",
        payload: checkpoint,
      }),
    ).resolves.toEqual({
      type: "save_checkpoint_snapshot_result",
      payload: {
        savedId: "checkpoint-reactive",
      },
    });
    expect(worker.postedMessage).toMatchObject({
      request: {
        payload: {
          id: "checkpoint-reactive",
        },
      },
    });
  });
});
