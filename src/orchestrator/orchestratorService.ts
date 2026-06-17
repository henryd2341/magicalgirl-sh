/* eslint-disable no-unused-vars */

import type { ChatMessageService } from "@/engine/chatMessageService";
import type {
  CreateCheckpointInput,
  CheckpointManager,
} from "@/engine/checkpointManager";
import type { GameEngineFacade } from "@/engine/gameEngineFacade";
import type {
  BuiltProviderRequest,
} from "@/orchestrator/harnessContextTypes";
import type {
  ProviderClient,
  ProviderStreamResult,
} from "@/orchestrator/providerClient";
import type { EventLogRepository } from "@/persistence/repositories/eventLogRepository";
import type { CheckpointSnapshotRecord } from "@/types/recovery";

export interface BuildRequestForTurnInput {
  userInput: string;
}

type ChatMessageLifecyclePort = Pick<
  ChatMessageService,
  | "createUserMessage"
  | "createAssistantProvisionalMessage"
  | "appendAssistantChunk"
  | "appendAssistantReasoning"
  | "finalizeAssistantMessage"
  | "markAssistantFailedDraft"
>;

export interface OrchestratorIdFactory {
  userMessageId: () => string;
  assistantMessageId: () => string;
}

export interface OrchestratorServiceDependencies {
  chatService: ChatMessageLifecyclePort;
  gameEngineFacade: GameEngineFacade;
  providerClient: ProviderClient;
  checkpointManager?: Pick<CheckpointManager, "createCheckpoint">;
  eventLogRepository?: EventLogRepository;
  buildRequest: (
    input: BuildRequestForTurnInput,
  ) => Promise<BuiltProviderRequest>;
  idFactory?: OrchestratorIdFactory;
  now?: () => string;
}

export interface RunUserTurnInput {
  userInput: string;
  userVisible?: boolean;
  aiVisible?: boolean;
}

export interface RunUserTurnResult {
  ok: boolean;
  request: BuiltProviderRequest | null;
  assistantMessageId: string;
  toolResults: Array<{ tool_name: string; tool_call_id: string; ok: boolean; output?: unknown; error?: string }>;
  providerMetadata?: Record<string, unknown>;
  error?: Error;
}

function defaultId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

export class OrchestratorService {
  private readonly chatService: ChatMessageLifecyclePort;

  private readonly gameEngineFacade: GameEngineFacade;

  private readonly providerClient: ProviderClient;


  private readonly checkpointManager:
    | {
        createCheckpoint(
          input: CreateCheckpointInput,
        ): Promise<CheckpointSnapshotRecord>;
      }
    | undefined;

  private readonly eventLogRepository: EventLogRepository | undefined;

  private readonly buildRequest: (
    input: BuildRequestForTurnInput,
  ) => Promise<BuiltProviderRequest>;

  private readonly idFactory: OrchestratorIdFactory;

  private readonly now: () => string;

  public constructor(dependencies: OrchestratorServiceDependencies) {
    this.chatService = dependencies.chatService;
    this.gameEngineFacade = dependencies.gameEngineFacade;
    this.providerClient = dependencies.providerClient;
    this.checkpointManager = dependencies.checkpointManager;
    this.eventLogRepository = dependencies.eventLogRepository;
    this.buildRequest = dependencies.buildRequest;
    this.idFactory =
      dependencies.idFactory ??
      ({
        userMessageId: () => defaultId("msg-user"),
        assistantMessageId: () => defaultId("msg-assistant"),
      } satisfies OrchestratorIdFactory);
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public async runUserTurn(
    input: RunUserTurnInput,
  ): Promise<RunUserTurnResult> {
    const userMessageId = this.idFactory.userMessageId();
    const assistantMessageId = this.idFactory.assistantMessageId();
    let request: BuiltProviderRequest | null = null;
    let checkpoint: CheckpointSnapshotRecord | null = null;
    let assistantMessageCreated = false;
    const toolResults: Array<{ tool_name: string; tool_call_id: string; ok: boolean; output?: unknown; error?: string }> = [];

    await this.chatService.createUserMessage({
      id: userMessageId,
      content: input.userInput,
      userVisible: input.userVisible,
      aiVisible: input.aiVisible,
      createdAt: this.now(),
    });

    try {
      request = await this.buildRequest({ userInput: input.userInput });
      checkpoint = await this.checkpointManager?.createCheckpoint({
        kind: "idle_checkpoint",
        reason: "before_ai_request",
        contextVersion: request.metadata.context_version,
        stateHash: request.metadata.state_hash,
        metadata: {
          requestId: request.metadata.request_id,
        },
      }) ?? null;
      this.gameEngineFacade.beginAiRequest(request.metadata.request_id);
      await this.appendEventLog({
        type: "RequestStarted",
        requestId: request.metadata.request_id,
        checkpointId: checkpoint?.id ?? null,
      });
      await this.chatService.createAssistantProvisionalMessage({
        id: assistantMessageId,
        requestId: request.metadata.request_id,
        createdAt: this.now(),
      });
      assistantMessageCreated = true;

      this.gameEngineFacade.advancePipeline("STREAMING_TEXT");
      const streamResult = await this.providerClient.stream(request, {
        onTextChunk: async (chunk) => {
          await this.chatService.appendAssistantChunk({
            messageId: assistantMessageId,
            chunk,
          });
        },
        onReasoningChunk: async (chunk) => {
          await this.chatService.appendAssistantReasoning({
            messageId: assistantMessageId,
            chunk,
          });
        },
      });
      toolResults.push(...streamResult.toolResults);

      // Inject tool call results as fold blocks in the assistant message
      const toolFoldHtml = buildToolFoldHtml(streamResult.toolResults);
      if (toolFoldHtml) {
        await this.chatService.appendAssistantChunk({
          messageId: assistantMessageId,
          chunk: toolFoldHtml,
        });
      }

      const failedResult = streamResult.toolResults.find((tr) => !tr.ok);
      if (failedResult) {
        throw new Error(
          `[TOOL_EXECUTION_FAILED] Tool ${failedResult.tool_name} (${failedResult.tool_call_id}) failed: ${failedResult.error ?? "unknown error"}`,
        );
      }

      const snapshot = this.gameEngineFacade.getSessionSnapshot();
      console.log("[OrchestratorService] AI done, sessionState =", snapshot.sessionState);
      if (snapshot.sessionState === "GENERATING") {
        this.gameEngineFacade.completeAiRequest();
        console.log("[OrchestratorService] completeAiRequest called");
      }

      await this.chatService.finalizeAssistantMessage({
        messageId: assistantMessageId,
        commitAck: true,
      });
      await this.appendEventLog({
        type: "AssistantMessageFinalized",
        requestId: request.metadata.request_id,
        assistantMessageId,
      });

      return {
        ok: true,
        request,
        assistantMessageId,
        toolResults,
        providerMetadata: streamResult.providerMetadata,
      };
    } catch (error) {
      if (assistantMessageCreated) {
        await this.chatService.markAssistantFailedDraft({
          messageId: assistantMessageId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      this.gameEngineFacade.enterErrorRecovery();

      return {
        ok: false,
        request,
        assistantMessageId,
        toolResults,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  public async retryUserTurn(input: {
    userContent: string;
  }): Promise<RunUserTurnResult> {
    const assistantMessageId = this.idFactory.assistantMessageId();
    let request: BuiltProviderRequest | null = null;
    let checkpoint: CheckpointSnapshotRecord | null = null;
    let assistantMessageCreated = false;
    const toolResults: Array<{ tool_name: string; tool_call_id: string; ok: boolean; output?: unknown; error?: string }> = [];

    // NOTE: do NOT create user message — it already exists from checkpoint rollback

    try {
      request = await this.buildRequest({ userInput: input.userContent });
      checkpoint = await this.checkpointManager?.createCheckpoint({
        kind: "idle_checkpoint",
        reason: "before_ai_request_retry",
        contextVersion: request.metadata.context_version,
        stateHash: request.metadata.state_hash,
        metadata: {
          requestId: request.metadata.request_id,
        },
      }) ?? null;
      this.gameEngineFacade.beginAiRequest(request.metadata.request_id);
      await this.appendEventLog({
        type: "RequestStarted",
        requestId: request.metadata.request_id,
        checkpointId: checkpoint?.id ?? null,
      });
      await this.chatService.createAssistantProvisionalMessage({
        id: assistantMessageId,
        requestId: request.metadata.request_id,
        createdAt: this.now(),
      });
      assistantMessageCreated = true;

      this.gameEngineFacade.advancePipeline("STREAMING_TEXT");
      const streamResult = await this.providerClient.stream(request, {
        onTextChunk: async (chunk) => {
          await this.chatService.appendAssistantChunk({
            messageId: assistantMessageId,
            chunk,
          });
        },
        onReasoningChunk: async (chunk) => {
          await this.chatService.appendAssistantReasoning({
            messageId: assistantMessageId,
            chunk,
          });
        },
      });
      toolResults.push(...streamResult.toolResults);

      const toolFoldHtml = buildToolFoldHtml(streamResult.toolResults);
      if (toolFoldHtml) {
        await this.chatService.appendAssistantChunk({
          messageId: assistantMessageId,
          chunk: toolFoldHtml,
        });
      }

      const failedResult = streamResult.toolResults.find((tr) => !tr.ok);
      if (failedResult) {
        throw new Error(
          `[TOOL_EXECUTION_FAILED] Tool ${failedResult.tool_name} (${failedResult.tool_call_id}) failed: ${failedResult.error ?? "unknown error"}`,
        );
      }

      const snapshot = this.gameEngineFacade.getSessionSnapshot();
      console.log("[OrchestratorService] AI done, sessionState =", snapshot.sessionState);
      if (snapshot.sessionState === "GENERATING") {
        this.gameEngineFacade.completeAiRequest();
        console.log("[OrchestratorService] completeAiRequest called");
      }

      await this.chatService.finalizeAssistantMessage({
        messageId: assistantMessageId,
        commitAck: true,
      });
      await this.appendEventLog({
        type: "AssistantMessageFinalized",
        requestId: request.metadata.request_id,
        assistantMessageId,
      });

      return {
        ok: true,
        request,
        assistantMessageId,
        toolResults,
        providerMetadata: streamResult.providerMetadata,
      };
    } catch (error) {
      if (assistantMessageCreated) {
        await this.chatService.markAssistantFailedDraft({
          messageId: assistantMessageId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      this.gameEngineFacade.enterErrorRecovery();

      return {
        ok: false,
        request,
        assistantMessageId,
        toolResults,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async appendEventLog(input: {
    type: "RequestStarted" | "AssistantMessageFinalized";
    requestId: string;
    checkpointId?: string | null;
    assistantMessageId?: string;
  }): Promise<void> {
    if (!this.eventLogRepository) {
      return;
    }

    await this.eventLogRepository.append({
      id: `${defaultId("event")}-${Math.random().toString(16).slice(2, 10)}`,
      type: input.type,
      createdAt: this.now(),
      source: "orchestrator_service",
      payload: {
        requestId: input.requestId,
        checkpointId: input.checkpointId ?? null,
        assistantMessageId: input.assistantMessageId,
      },
    });
  }
}

function buildToolFoldHtml(
  toolResults: ProviderStreamResult["toolResults"],
): string {
  const visible = toolResults.filter(
    (tr) => tr.ok,
  );
  if (visible.length === 0) return "";

  let html = `\n\n<details class="chat-tool-fold"><summary>工具调用 (${visible.length})</summary>\n\n`;

  for (const tr of visible) {
    if (tr.tool_name === "update_variables") {
      html += "**变量更新**\n";
      const output = tr.output as
        | { patches?: Array<{ path: string; value: unknown }> }
        | undefined;
      if (output?.patches && output.patches.length > 0) {
        for (const p of output.patches) {
          html += `- \`${p.path}\` → ${JSON.stringify(p.value)}\n`;
        }
      } else {
        html += "*(已执行)*\n";
      }
    } else if (tr.tool_name === "read_skill") {
      html += "**读取技能**\n";
      const output = tr.output as { name?: string } | undefined;
      if (output?.name) {
        html += `- ${output.name}\n`;
      } else {
        html += "*(已执行)*\n";
      }
    } else if (tr.tool_name === "trigger_battle") {
      html += "**触发战斗**\n";
      const output = tr.output as
        | { encounter_id?: string; narrative_reason?: string }
        | undefined;
      if (output?.encounter_id) {
        html += `- 遭遇: ${output.encounter_id}\n`;
      }
      if (output?.narrative_reason) {
        html += `- 原因: ${output.narrative_reason}\n`;
      }
      if (!output?.encounter_id && !output?.narrative_reason) {
        html += "*(已执行)*\n";
      }
    }
    html += "\n";
  }

  html += "</details>\n";
  return html;
}
