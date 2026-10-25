import { describe, expect, it } from "vitest";
import {
  encodeFullSaveV3,
  decodeFullSaveV3Data,
} from "@/persistence/fullSaveMessageCodec";
import { parseFullSaveImport } from "@/persistence/importSave";
import {
  FULL_SAVE_EXPORT_FORMAT,
  type FullSaveExportV2,
} from "@/persistence/exportSave";
import type { ChatMessage } from "@/types/chat";

const message: ChatMessage = {
  id: "same-id",
  role: "assistant",
  kind: "battle_summary",
  summary_level: "verbose",
  content:
    '正文<details class="chat-tool-chip"><summary>工具</summary>完整结果</details>',
  reasoning: "完整思考",
  user_visible: true,
  ai_visible: false,
  provisional: false,
  finalized: true,
  failed: false,
  request_id: "req",
  context_version: 2,
  tool_call_id: "call",
  created_at: "2026-10-25T00:00:00Z",
};

function fixture(): FullSaveExportV2 {
  return {
    format: FULL_SAVE_EXPORT_FORMAT,
    version: 2,
    exportedAt: "now",
    exportId: "export",
    createdCheckpointId: "save",
    saveMetaId: "meta",
    data: {
      chatMessages: [message],
      checkpointSnapshots: [
        {
          id: "save",
          kind: "save_checkpoint",
          snapshotVersion: 1,
          createdAt: "then",
          reason: "test",
          sessionSnapshot: {
            sessionState: "IDLE",
            pipelineState: null,
            activeRequestId: null,
          },
          variableValue: null,
          chatMessages: [message],
          metadata: { flags: [true, false] },
        },
      ],
      saveMeta: [],
      eventLog: [],
      variableValue: null,
      variableChangeLog: [],
      worldInfo: [],
    },
  };
}

describe("full-save message codec", () => {
  it("interns complete JSON values independent of key order, retaining versions, order and multiplicity", () => {
    const input = fixture();
    const reordered = Object.fromEntries(
      Object.entries(message).reverse(),
    ) as unknown as ChatMessage;
    const old = {
      ...message,
      content: "旧分支内容",
      reasoning: "旧思考",
      finalized: false,
      failed: true,
    };
    const hidden = { ...message, user_visible: false, ai_visible: true };
    input.data.checkpointSnapshots[0]!.chatMessages = [
      old,
      hidden,
      reordered,
      old,
    ];
    input.data.checkpointSnapshots.push({
      ...input.data.checkpointSnapshots[0]!,
      id: "empty",
      chatMessages: [],
    });
    const original = JSON.parse(JSON.stringify(input));
    const wire = encodeFullSaveV3(input);
    expect(wire.data.messagePool).toHaveLength(3);
    expect(wire.data.chatMessageRefs).toEqual([0]);
    expect(wire.data.checkpointSnapshots.map((c) => c.chatMessageRefs)).toEqual(
      [[1, 2, 0, 1], []],
    );
    expect(parseFullSaveImport(JSON.stringify(wire))).toEqual(original);
    expect(input).toEqual(original);
    wire.data.messagePool[0]!.content = "changed pool";
    expect(input).toEqual(original);
  });

  it("preserves unknown nested JSON fields and isolates every expanded occurrence", () => {
    const input = fixture();
    const extended = { ...message, extra: { nested: ["value"], b: false } };
    input.data.chatMessages = [extended, extended];
    input.data.checkpointSnapshots[0]!.chatMessages = [
      { ...extended, extra: { b: false, nested: ["value"] } },
    ];
    const wire = encodeFullSaveV3(input);
    expect(wire.data.messagePool).toHaveLength(1);
    const expanded = decodeFullSaveV3Data(wire.data);
    expect(expanded).toEqual(input.data);
    const first = expanded.chatMessages[0] as typeof extended;
    first.extra.nested.push("mutation");
    first.content = "edited";
    expect(expanded.chatMessages[1]).toEqual(extended);
    expect(expanded.checkpointSnapshots[0]!.chatMessages[0]).toEqual(extended);
    expect(wire.data.messagePool[0]).toEqual(extended);
  });

  it("supports empty pools and histories", () => {
    const input = fixture();
    input.data.chatMessages = [];
    input.data.checkpointSnapshots[0]!.chatMessages = [];
    const wire = encodeFullSaveV3(input);
    expect(wire.data.messagePool).toEqual([]);
    expect(parseFullSaveImport(JSON.stringify(wire))).toEqual(input);
  });

  it.each([
    ["id", undefined],
    ["role", "tool"],
    ["kind", "unknown"],
    ["content", null],
    ["created_at", 4],
    ["user_visible", 1],
    ["ai_visible", "true"],
    ["provisional", undefined],
    ["finalized", null],
    ["failed", "false"],
    ["summary_level", "short"],
    ["reasoning", {}],
    ["request_id", 3],
    ["context_version", "2"],
    ["tool_call_id", []],
  ])("rejects invalid message field %s", (field, value) => {
    const wire = encodeFullSaveV3(fixture());
    Object.assign(wire.data.messagePool[0]!, { [field as string]: value });
    expect(() => parseFullSaveImport(JSON.stringify(wire))).toThrow(
      "[FULL_SAVE_IMPORT_INVALID]",
    );
  });
});
