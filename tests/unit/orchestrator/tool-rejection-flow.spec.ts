import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidToolInputError } from "ai";
import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { ChatMessageService } from "@/engine/chatMessageService";
import { InputValidationError, VariablePatchRejectedError } from "@/engine/inputValidationError";
import { InMemoryVariableRepository, InMemoryVariableChangeLogRepository } from "@/persistence/repositories/variableRepository";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { InMemoryWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { AiSdkProviderClient } from "@/orchestrator/aiSdkProviderClient";
import { OrchestratorService } from "@/orchestrator/orchestratorService";
import { buildHarnessRequest } from "@/orchestrator/promptBuilder";
import { normalizeStepToolResults } from "@/orchestrator/toolResults";
import type { HarnessToolExecutorDeps } from "@/orchestrator/harnessTools";
import { createHarnessToolsWithExecute } from "@/orchestrator/harnessTools";

const sdk = vi.hoisted(() => ({ streamText: vi.fn(), generateText: vi.fn() }));
vi.mock("ai", async importOriginal => ({ ...await importOriginal<typeof import("ai")>(), ...sdk }));
vi.mock("@/orchestrator/languageModelFactory", () => ({ createLanguageModel: () => ({}) }));

type Step = Parameters<typeof normalizeStepToolResults>[0];
type Transport = {
  tools: Record<string, { execute: (input: unknown, options: { toolCallId: string }) => Promise<unknown> }>;
  onStepFinish: (step: Step) => void;
};
const invalid = { patches: [{ path: "player.profile", value: { name: "incomplete" } }] };
const valid = { patches: [{ path: "player.money", value: 123 }] };
const battle = { encounter_id: "synthetic", enemies: [{ enemy_id: "1", count: 1 }], narrative_reason: "test" };
const meta = { requestId: "request", contextVersion: 1, stateHash: "initial" };
const certificate = () => new VariablePatchRejectedError(new InputValidationError("VARIABLE_SCHEMA_INVALID", "invalid player structure"));

beforeEach(() => { sdk.streamText.mockReset(); sdk.generateText.mockReset(); });

describe("safe rejection through SDK, real variable execution and turn finalization", () => {
  it.each([false, true].flatMap(retry => [false, true].flatMap(streamingEnabled =>
    ["narrative", "update", "battle", "parse", "fatal", "missing", "battle-callback"].map(scenario => ({ retry, streamingEnabled, scenario })),
  )))("$scenario retry=$retry streaming=$streamingEnabled", async ({ retry, streamingEnabled, scenario }) => {
    const variables = new InMemoryVariableRepository();
    const logs = new InMemoryVariableChangeLogRepository();
    const save = vi.spyOn(variables, "saveCurrent");
    const append = vi.spyOn(logs, "append");
    const facade = new GameEngineFacade(createSessionManager(), { variableRepository: variables, variableChangeLogRepository: logs });
    const dispatch = vi.spyOn(facade, "dispatchCommand");
    const repository = new InMemoryChatHistoryRepository();
    const chat = new ChatMessageService(repository);
    const callback = vi.fn(async () => { if (scenario === "battle-callback") throw certificate(); });
    const execute = async (options: Transport) => {
      const firstCall = { toolName: "update_variables", toolCallId: "rejected", input: invalid };
      if (scenario === "parse") {
        const error = new InvalidToolInputError({ toolName: firstCall.toolName, toolInput: "{}", cause: new Error("schema") });
        options.onStepFinish({ toolCalls: [{ ...firstCall, invalid: true, error }], toolResults: [], content: [{ type: "tool-error", toolName: firstCall.toolName, toolCallId: firstCall.toolCallId, error: error.message }] });
      } else {
        const output = await options.tools.update_variables.execute(invalid, { toolCallId: firstCall.toolCallId });
        options.onStepFinish({ toolCalls: [firstCall], toolResults: [{ toolCallId: firstCall.toolCallId, output }] });
      }
      expect(save).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
      if (scenario === "fatal" || scenario === "missing") {
        options.onStepFinish({ toolCalls: [{ toolName: "update_variables", toolCallId: "fatal" }], toolResults: [], content: scenario === "fatal" ? [{ type: "tool-error", toolCallId: "fatal", error: "[VARIABLE_SCHEMA_INVALID] unknown execution failure" }] : [] });
      }
      if (["update", "fatal", "missing", "battle", "battle-callback"].includes(scenario)) {
        const toolName = scenario.startsWith("battle") ? "trigger_battle" : "update_variables";
        const input = toolName === "trigger_battle" ? battle : valid;
        const toolCallId = "followup";
        try {
          const output = await options.tools[toolName].execute(input, { toolCallId });
          options.onStepFinish({ toolCalls: [{ toolName, toolCallId, input }], toolResults: [{ toolCallId, output }] });
        } catch (error) {
          expect(facade.getSessionSnapshot().sessionState).toBe("COMBAT_PENDING");
          options.onStepFinish({ toolCalls: [{ toolName, toolCallId, input }], toolResults: [], content: [{ type: "tool-error", toolName, toolCallId, error }] });
        }
      }
    };
    sdk.generateText.mockImplementation(async (options: Transport) => { await execute(options); return { text: "Narrative continues.", finishReason: "stop" }; });
    sdk.streamText.mockImplementation((options: Transport) => ({ fullStream: (async function* () {
      await execute(options);
      yield { type: "text-delta", text: "Narrative continues." };
      yield { type: "finish", finishReason: "stop" };
    })() }));
    const provider = new AiSdkProviderClient({ providerName: "test", baseURL: "", model: "test", streamingEnabled, harnessDeps: { dispatchCommand: facade.dispatchCommand.bind(facade), onTriggerBattle: callback } });
    const requestFor = (userInput: string) => buildHarnessRequest({ chatRepository: repository, variableRepository: variables, worldInfoRepository: new InMemoryWorldInfoRepository(), systemPrompt: "test", userInput, requestId: "request", contextVersion: 1 });
    const service = new OrchestratorService({ chatService: chat, gameEngineFacade: facade, providerClient: provider, buildRequest: ({ userInput }) => requestFor(userInput), idFactory: { userMessageId: () => "user", assistantMessageId: () => "assistant" } });
    const outcome = retry ? await service.retryUserTurn({ userContent: "continue" }) : await service.runUserTurn({ userInput: "continue" });
    const fatal = ["fatal", "missing", "battle-callback"].includes(scenario);
    expect(outcome.ok).toBe(!fatal);
    expect(outcome.toolResults[0]).toMatchObject({ ok: false, failureKind: "input-rejected-before-write" });
    if (fatal) expect(outcome.toolResults.find(result => !result.ok && !result.failureKind)).toBeDefined();
    const saved = (await repository.getById("assistant"))!;
    expect(saved).toMatchObject({ failed: fatal, finalized: !fatal, provisional: false, ai_visible: true });
    expect(saved.content).toContain("失败");
    expect(saved.content).toContain("Narrative continues.");
    expect(facade.getSessionSnapshot().sessionState).toBe(fatal ? "ERROR_RECOVERY" : scenario === "battle" ? "COMBAT_PENDING" : "IDLE");
    const written = ["update", "fatal", "missing"].includes(scenario);
    expect(save).toHaveBeenCalledTimes(written ? 1 : 0);
    expect(append).toHaveBeenCalledTimes(written ? 1 : 0);
    if (written) expect((await variables.getCurrent())?.root.player.money).toBe(123);
    if (scenario === "parse") expect(dispatch).not.toHaveBeenCalled();
    if (!fatal) {
      const nextPrompt = await requestFor("next");
      expect(nextPrompt.messages.some(message => message.role === "assistant" && message.content.includes("Narrative continues."))).toBe(true);
      expect(nextPrompt.segments.find(segment => segment.id === "recent_variable_updates")?.content ?? "").not.toContain("player.profile");
    }
  });
});

describe("optimized dispatch write boundary", () => {
  it.each(["safe-success", "safe-safe", "safe-db", "unknown", "db-after-save"])("%s", async scenario => {
    const variables = new InMemoryVariableRepository();
    const logs = new InMemoryVariableChangeLogRepository();
    if (scenario === "db-after-save") vi.spyOn(logs, "append").mockRejectedValue(new Error("log failed after save"));
    const facade = new GameEngineFacade(createSessionManager(), { variableRepository: variables, variableChangeLogRepository: logs });
    const dispatchCommand = vi.fn(facade.dispatchCommand.bind(facade));
    if (scenario === "unknown") dispatchCommand.mockRejectedValueOnce(new Error("[VARIABLE_SCHEMA_INVALID] lookalike"));
    if (scenario === "safe-db") vi.spyOn(variables, "saveCurrent").mockRejectedValue(new Error("DB failed"));
    sdk.generateText.mockResolvedValue({ text: JSON.stringify(scenario.startsWith("safe") ? invalid : valid) });
    const deps: HarnessToolExecutorDeps = { dispatchCommand, getToolProfile: vi.fn().mockResolvedValue({ kind: "openai-compatible", model: "test", baseURL: "http://unused" }) };
    const tools = createHarnessToolsWithExecute(deps, meta);
    const execute = () => tools.update_variables.execute!(scenario === "safe-safe" ? invalid : valid, { toolCallId: "optimized", messages: [] });
    if (scenario === "safe-success") {
      expect(await execute()).toMatchObject({ ok: true, output: { patches: valid.patches } });
    } else if (scenario === "safe-safe") {
      expect(await execute()).toMatchObject({ ok: false, failureKind: "input-rejected-before-write", commitAck: false });
      expect(await variables.getCurrent()).toBeNull();
    } else {
      await expect(execute()).rejects.toThrow();
    }
    expect(dispatchCommand).toHaveBeenCalledTimes(scenario.startsWith("safe") ? 2 : 1);
    if (scenario === "db-after-save") expect((await variables.getCurrent())?.root.player.money).toBe(123);
  });
});
