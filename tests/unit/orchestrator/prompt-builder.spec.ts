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
      isConstant: false,
    });
    await worldInfoRepository.save({
      id: "wi-disabled",
      keywords: ["旧校舍"],
      content: "禁用条目不能进入请求。",
      priority: 100,
      enabled: false,
      isConstant: false,
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
    expect(request.segments.map((segment) => segment.id)).toEqual([
      "system",
      "constant_world_info",
      "matched_world_info",
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

  it("does not cap visible history or matched world info by entry count", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    for (let index = 1; index <= 10; index += 1) {
      await chatRepository.save(
        createMessage({
          id: `msg-history-${index}`,
          content: `可见历史 ${index}`,
          created_at: `2026-05-26T12:${index.toString().padStart(2, "0")}:00.000Z`,
        }),
      );
    }

    const worldInfoRepository = new InMemoryWorldInfoRepository();
    for (let index = 1; index <= 5; index += 1) {
      await worldInfoRepository.save({
        id: `wi-match-${index}`,
        keywords: ["触发词"],
        content: `命中条目 ${index}`,
        priority: 100 - index,
        enabled: true,
        isConstant: false,
      });
    }

    const request = await buildHarnessRequest({
      chatRepository,
      variableRepository: new InMemoryVariableRepository(),
      worldInfoRepository,
      systemPrompt: "stable",
      userInput: "触发词",
      requestId: "req-no-count-caps",
      contextVersion: 22,
      now: "2026-05-26T12:20:00.000Z",
      budget: createDefaultContextBudget(),
    });

    for (let index = 1; index <= 10; index += 1) {
      expect(request.promptText).toContain(`可见历史 ${index}`);
    }
    for (let index = 1; index <= 5; index += 1) {
      expect(request.promptText).toContain(`命中条目 ${index}`);
      expect(request.traces).toContainEqual(
        expect.objectContaining({
          sourceId: `wi-match-${index}`,
          included: true,
          reason: "keyword_match",
        }),
      );
    }
    expect(request.traces).not.toContainEqual(
      expect.objectContaining({ reason: "budget_world_info_count" }),
    );
    expect(request.traces).not.toContainEqual(
      expect.objectContaining({ reason: "budget_history_count" }),
    );
  });

  it("syncs gender-specific world info activation before selecting context", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    const variableRepository = new InMemoryVariableRepository();
    const variableState = new VariableEngine().createInitialState();
    variableState.root.player.profile.gender = "男";
    await variableRepository.saveCurrent(variableState);

    const worldInfoRepository = new InMemoryWorldInfoRepository();
    await worldInfoRepository.save({
      id: "raw_entries/男user",
      keywords: ["主角"],
      content: "男性主角档案。",
      priority: 500,
      enabled: false,
      isConstant: false,
    });
    await worldInfoRepository.save({
      id: "raw_entries/女user",
      keywords: ["主角"],
      content: "女性主角档案。",
      priority: 500,
      enabled: true,
      isConstant: false,
    });

    const request = await buildHarnessRequest({
      chatRepository,
      variableRepository,
      worldInfoRepository,
      systemPrompt: "stable",
      userInput: "请检查主角状态。",
      requestId: "req-gender-world-info",
      contextVersion: 29,
      now: "2026-05-27T15:00:00.000Z",
      budget: createDefaultContextBudget(),
    });

    expect(request.promptText).toContain("男性主角档案。");
    expect(request.promptText).not.toContain("女性主角档案。");
    expect(request.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "raw_entries/女user",
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

  it("injects constant world info before FTS matched entries without cascading matches", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    await chatRepository.save(
      createMessage({
        id: "msg-cascade-source",
        content: "今天的任务发生在弓川市。",
        created_at: "2026-05-26T10:00:00.000Z",
      }),
    );

    const worldInfoRepository = new InMemoryWorldInfoRepository();
    await worldInfoRepository.save({
      id: "raw_entries/世界观基础",
      keywords: ["弓川市"],
      content: "弓川市存在 M.A.S.C.O.T 监测网络。",
      priority: 100,
      enabled: true,
      isConstant: true,
    });
    await worldInfoRepository.save({
      id: "raw_entries/M.A.S.C.O.T",
      keywords: ["后勤"],
      content: "星偶负责通讯、传送与后勤。",
      priority: 95,
      enabled: true,
      isConstant: false,
    });
    await worldInfoRepository.save({
      id: "raw_entries/青井霞",
      keywords: ["青井霞"],
      content: "青井霞是已退役的初代魔法少女。",
      priority: 80,
      enabled: true,
      isConstant: false,
    });

    const request = await buildHarnessRequest({
      chatRepository,
      variableRepository: new InMemoryVariableRepository(),
      worldInfoRepository,
      systemPrompt:
        "stable {{player.name}} at {{world.location.name}} / {{missing.value}}",
      userInput: "继续弓川市的任务，并观察星偶。",
      requestId: "req-world-info-order",
      contextVersion: 18,
      now: "2026-05-26T10:01:00.000Z",
      mustacheVariables: {
        "player.name": "雷伊",
      },
    });

    expect(request.promptText).toContain(
      "stable 雷伊 at 教室 / {{missing.value}}",
    );
    expect(request.promptText).toContain("弓川市存在 M.A.S.C.O.T 监测网络。");
    expect(request.promptText).toContain("星偶负责通讯、传送与后勤。");
    expect(request.promptText).not.toContain("青井霞是已退役的初代魔法少女。");
    expect(request.segments.map((segment) => segment.id)).toEqual([
      "system",
      "constant_world_info",
      "matched_world_info",
      "state",
      "tools",
      "history",
    ]);
    expect(request.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "raw_entries/世界观基础",
        included: true,
        reason: "constant",
      }),
    );
    expect(request.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "raw_entries/M.A.S.C.O.T",
        included: true,
        reason: "fts_match",
      }),
    );
    expect(request.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "raw_entries/青井霞",
        included: false,
        reason: "fts_miss",
      }),
    );
  });

  it("resolves mustache aliases, defaults, and explicit variable overrides", async () => {
    const variableRepository = new InMemoryVariableRepository();
    const variableState = new VariableEngine().createInitialState();
    variableState.root.player.profile.name = "小圆";
    variableState.root.world.location.name = "弓川市";
    await variableRepository.saveCurrent(variableState);

    const request = await buildHarnessRequest({
      chatRepository: new InMemoryChatHistoryRepository(),
      variableRepository,
      worldInfoRepository: new InMemoryWorldInfoRepository(),
      systemPrompt: [
        "alias={{user}}",
        "path={{world.location.name}}",
        "explicit={{nickname}}",
        "pipeDefault={{emptyName|default=鹿目真昼}}",
        "coalesceDefault={{missing.name ?? 鹿目真昼}}",
        "missing={{missing.value}}",
      ].join("\n"),
      userInput: "检查变量插值。",
      requestId: "req-mustache-alias-defaults",
      contextVersion: 19,
      now: "2026-05-26T11:00:00.000Z",
      mustacheVariables: {
        nickname: "雷伊",
        emptyName: "",
      },
    });

    expect(request.promptText).toContain("alias=小圆");
    expect(request.promptText).toContain("path=弓川市");
    expect(request.promptText).toContain("explicit=雷伊");
    expect(request.promptText).toContain("pipeDefault=鹿目真昼");
    expect(request.promptText).toContain("coalesceDefault=鹿目真昼");
    expect(request.promptText).toContain("missing={{missing.value}}");
  });

  it("lets explicit mustache variables override the user alias", async () => {
    const variableRepository = new InMemoryVariableRepository();
    const variableState = new VariableEngine().createInitialState();
    variableState.root.player.profile.name = "变量树姓名";
    await variableRepository.saveCurrent(variableState);

    const request = await buildHarnessRequest({
      chatRepository: new InMemoryChatHistoryRepository(),
      variableRepository,
      worldInfoRepository: new InMemoryWorldInfoRepository(),
      systemPrompt: "user={{user}}",
      userInput: "检查显式变量优先级。",
      requestId: "req-mustache-explicit-alias",
      contextVersion: 20,
      now: "2026-05-26T11:01:00.000Z",
      mustacheVariables: {
        user: "显式姓名",
      },
    });

    const systemSegment = request.segments.find(
      (segment) => segment.id === "system",
    );
    expect(systemSegment?.content).toBe("user=显式姓名");
    expect(systemSegment?.content).not.toContain("变量树姓名");
  });

  it("includes self-documenting tool descriptions with writable/read-only/hidden paths and envelope guide", async () => {
    const request = await buildHarnessRequest({
      chatRepository: new InMemoryChatHistoryRepository(),
      variableRepository: new InMemoryVariableRepository(),
      worldInfoRepository: new InMemoryWorldInfoRepository(),
      systemPrompt: "stable",
      userInput: "检查工具描述。",
      requestId: "req-tool-descriptions",
      contextVersion: 21,
      now: "2026-05-28T10:00:00.000Z",
    });

    const toolsSegment = request.segments.find(
      (segment) => segment.id === "tools",
    );
    expect(toolsSegment).toBeDefined();
    const toolsContent = toolsSegment!.content;

    expect(toolsContent).toContain("tool: update_variables");
    expect(toolsContent).toContain("tool: trigger_battle");
    expect(toolsContent).toContain("Writable paths");
    expect(toolsContent).toContain("Read-only");
    expect(toolsContent).toContain("Hidden");
    expect(toolsContent).toContain("combat.level");
    expect(toolsContent).toContain("combat.hp");
    expect(toolsContent).toContain("player.money");
    expect(toolsContent).toContain("player.relationships");
    expect(toolsContent).toContain("inventory.items");
    expect(toolsContent).toContain("encounter_id");
    expect(toolsContent).toContain("narrative_reason");
    expect(toolsContent).toContain("modifiers");
    expect(toolsContent).toContain("player.profile.gender");

    expect(toolsContent).toContain("Tool Call Envelope Guide");
    expect(toolsContent).toContain("request_id");
    expect(toolsContent).toContain("state_hash");
    expect(toolsContent).toContain("tool_call_id");
    expect(toolsContent).toContain("issued_at");
  });
});
