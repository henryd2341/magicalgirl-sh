import { VariableEngine } from "@/engine/variableEngine";
import {
  buildHarnessRequest,
  createDefaultContextBudget,
} from "@/orchestrator/promptBuilder";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import {
  InMemoryVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { InMemoryWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import type { ChatMessage } from "@/types/chat";
import { describe, expect, it } from "vitest";

function createMessage(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, "id" | "content">,
): ChatMessage {
  return {
    id: overrides.id,
    role: overrides.role ?? "user",
    kind: overrides.kind ?? "normal",
    summary_level: overrides.summary_level,
    content: overrides.content,
    user_visible: overrides.user_visible ?? true,
    ai_visible: overrides.ai_visible ?? true,
    provisional: overrides.provisional ?? false,
    finalized: overrides.finalized ?? true,
    failed: overrides.failed ?? false,
    request_id: overrides.request_id,
    context_version: overrides.context_version,
    tool_call_id: overrides.tool_call_id,
    created_at: overrides.created_at ?? "2026-05-23T00:00:00.000Z",
  };
}

describe("buildHarnessRequest", () => {
  it("builds a complete auditable Harness request with stable system, dynamic injections, tools, and visible history", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    await chatRepository.save(
      createMessage({
        id: "msg-001",
        content: "我走向旧校舍。",
        created_at: "2026-05-23T00:01:00.000Z",
      }),
    );
    await chatRepository.save(
      createMessage({
        id: "msg-hidden",
        content: "这条隐藏消息不能进 prompt。",
        ai_visible: false,
        created_at: "2026-05-23T00:02:00.000Z",
      }),
    );
    await chatRepository.save(
      createMessage({
        id: "msg-draft",
        role: "assistant",
        kind: "failed_draft",
        content: "失败草稿不能进 prompt。",
        finalized: false,
        failed: true,
        created_at: "2026-05-23T00:03:00.000Z",
      }),
    );
    await chatRepository.save(
      createMessage({
        id: "msg-002",
        role: "assistant",
        content: "旧校舍的窗户映着粉色晚霞。",
        created_at: "2026-05-23T00:04:00.000Z",
      }),
    );

    const worldInfoRepository = new InMemoryWorldInfoRepository();
    await worldInfoRepository.save({
      id: "wi-old-school",
      keywords: ["旧校舍"],
      content: "旧校舍在雨后会出现影魔涂鸦。",
      priority: 90,
      enabled: true,
    });
    await worldInfoRepository.save({
      id: "wi-disabled",
      keywords: ["旧校舍"],
      content: "禁用条目不能进入请求。",
      priority: 100,
      enabled: false,
    });

    const variableRepository = new InMemoryVariableRepository();
    const variableState = new VariableEngine().createInitialState();
    variableState.root.player.profile.name = "雷伊";
    variableState.root.world.location.name = "旧校舍";
    variableState.root.inventory.items = { 药草: 2 };
    await variableRepository.saveCurrent(variableState);

    const request = await buildHarnessRequest({
      chatRepository,
      variableRepository,
      worldInfoRepository,
      systemPrompt: "你是本项目的叙事 Harness 宪法。",
      userInput: "继续探索旧校舍。",
      requestId: "req-harness-001",
      contextVersion: 7,
      now: "2026-05-23T00:05:00.000Z",
      budget: createDefaultContextBudget(),
    });

    expect(request.metadata).toEqual({
      request_id: "req-harness-001",
      context_version: 7,
      state_hash: "initial",
      issued_at: "2026-05-23T00:05:00.000Z",
    });
    expect(request.segments[0]).toMatchObject({
      kind: "system",
      included: true,
      content: "你是本项目的叙事 Harness 宪法。",
    });
    expect(request.segments.map((segment) => segment.kind)).toEqual([
      "system",
      "world_info",
      "state",
      "tools",
      "history",
    ]);
    expect(request.promptText).toContain("旧校舍在雨后会出现影魔涂鸦。");
    expect(request.promptText).toContain("角色名称: 雷伊");
    expect(request.promptText).toContain("当前地点: 旧校舍");
    expect(request.promptText).toContain("药草: 2");
    expect(request.promptText).toContain("update_variables");
    expect(request.promptText).toContain("trigger_battle");
    expect(request.promptText).toContain("我走向旧校舍。");
    expect(request.promptText).toContain("旧校舍的窗户映着粉色晚霞。");
    expect(request.promptText).not.toContain("隐藏消息不能进 prompt");
    expect(request.promptText).not.toContain("失败草稿不能进 prompt");
    expect(request.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "wi-old-school",
        included: true,
        reason: "keyword_match",
      }),
    );
    expect(request.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "wi-disabled",
        included: false,
        reason: "disabled",
      }),
    );
  });

  it("increments context versions and preserves the current variable state hash", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    const worldInfoRepository = new InMemoryWorldInfoRepository();
    const variableRepository = new InMemoryVariableRepository();
    const variableState = new VariableEngine().createInitialState();
    variableState.stateHash = "state-custom";
    await variableRepository.saveCurrent(variableState);

    const first = await buildHarnessRequest({
      chatRepository,
      variableRepository,
      worldInfoRepository,
      systemPrompt: "stable",
      userInput: "第一轮",
      requestId: "req-001",
      now: "2026-05-23T00:00:00.000Z",
    });
    const second = await buildHarnessRequest({
      chatRepository,
      variableRepository,
      worldInfoRepository,
      systemPrompt: "stable",
      userInput: "第二轮",
      requestId: "req-002",
      now: "2026-05-23T00:01:00.000Z",
    });

    expect(first.metadata.context_version).toBe(1);
    expect(second.metadata.context_version).toBe(2);
    expect(first.metadata.state_hash).toBe("state-custom");
    expect(second.metadata.state_hash).toBe("state-custom");
  });

  it("includes only minimal AI-visible battle summaries in provider history", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    await chatRepository.save(
      createMessage({
        id: "summary-verbose",
        role: "system",
        kind: "battle_summary",
        summary_level: "verbose",
        content: "verbose developer battle diagnostics",
        user_visible: false,
        ai_visible: true,
        created_at: "2026-05-24T00:01:00.000Z",
      }),
    );
    await chatRepository.save(
      createMessage({
        id: "summary-default",
        role: "system",
        kind: "battle_summary",
        summary_level: "default",
        content: "default player battle recap",
        user_visible: true,
        ai_visible: true,
        created_at: "2026-05-24T00:02:00.000Z",
      }),
    );
    await chatRepository.save(
      createMessage({
        id: "summary-minimal",
        role: "system",
        kind: "battle_summary",
        summary_level: "minimal",
        content: "minimal provider battle summary",
        user_visible: false,
        ai_visible: true,
        created_at: "2026-05-24T00:03:00.000Z",
      }),
    );

    const request = await buildHarnessRequest({
      chatRepository,
      variableRepository: new InMemoryVariableRepository(),
      worldInfoRepository: new InMemoryWorldInfoRepository(),
      systemPrompt: "stable",
      userInput: "继续剧情。",
      requestId: "req-battle-summary-history",
      contextVersion: 12,
      now: "2026-05-24T00:04:00.000Z",
    });

    expect(request.promptText).toContain("minimal provider battle summary");
    expect(request.promptText).not.toContain(
      "default player battle recap",
    );
    expect(request.promptText).not.toContain(
      "verbose developer battle diagnostics",
    );
    expect(request.messages).toContainEqual({
      role: "system",
      content: "minimal provider battle summary",
    });
    expect(request.messages).not.toContainEqual({
      role: "system",
      content: "default player battle recap",
    });
    expect(request.messages).not.toContainEqual({
      role: "system",
      content: "verbose developer battle diagnostics",
    });
  });
});
