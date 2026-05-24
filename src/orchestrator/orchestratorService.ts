/* eslint-disable no-unused-vars */

import type { ChatMessageService } from "@/engine/chatMessageService";
import type { GameEngineFacade } from "@/engine/gameEngineFacade";
import type {
  BuiltProviderRequest,
  ProviderToolCallCandidate,
} from "@/orchestrator/harnessContextTypes";
import type { ProviderClient } from "@/orchestrator/providerClient";
import type {
  ToolEnvelopeCandidate,
  ToolExecutionFailureResult,
} from "@/orchestrator/toolEnvelope";

export interface BuildRequestForTurnInput {
  userInput: string;
}

export interface OrchestratorIdFactory {
  userMessageId: () => string;
  assistantMessageId: () => string;
}

export interface ToolExecutionPort {
  execute(
    envelope: ToolEnvelopeCandidate,
  ): Promise<ToolExecutionFailureResult<string> | { ok: true; commitAck: true }>;
}

export interface OrchestratorServiceDependencies {
  chatService: ChatMessageService;
  gameEngineFacade: GameEngineFacade;
  providerClient: ProviderClient;
  toolExecutor: ToolExecutionPort | null;
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
  toolResults: Array<ToolExecutionFailureResult<string> | { ok: true }>;
  error?: Error;
}

function defaultId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

function wrapToolCall(
  toolCall: ProviderToolCallCandidate,
  request: BuiltProviderRequest,
): ToolEnvelopeCandidate {
  return {
    ...toolCall,
    request_id: request.metadata.request_id,
    context_version: request.metadata.context_version,
    state_hash: request.metadata.state_hash,
    issued_at: request.metadata.issued_at,
  };
}

export class OrchestratorService {
  private readonly chatService: ChatMessageService;

  private readonly gameEngineFacade: GameEngineFacade;

  private readonly providerClient: ProviderClient;

  private readonly toolExecutor: ToolExecutionPort | null;

  private readonly buildRequest: (
    input: BuildRequestForTurnInput,
  ) => Promise<BuiltProviderRequest>;

  private readonly idFactory: OrchestratorIdFactory;

  private readonly now: () => string;

  public constructor(dependencies: OrchestratorServiceDependencies) {
    this.chatService = dependencies.chatService;
    this.gameEngineFacade = dependencies.gameEngineFacade;
    this.providerClient = dependencies.providerClient;
    this.toolExecutor = dependencies.toolExecutor;
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
    const toolResults: Array<ToolExecutionFailureResult<string> | { ok: true }> =
      [];

    await this.chatService.createUserMessage({
      id: userMessageId,
      content: input.userInput,
      userVisible: input.userVisible,
      aiVisible: input.aiVisible,
      createdAt: this.now(),
    });

    try {
      request = await this.buildRequest({ userInput: input.userInput });
      this.gameEngineFacade.beginAiRequest(request.metadata.request_id);
      await this.chatService.createAssistantProvisionalMessage({
        id: assistantMessageId,
        requestId: request.metadata.request_id,
        createdAt: this.now(),
      });

      this.gameEngineFacade.advancePipeline("STREAMING_TEXT");
      const streamResult = await this.providerClient.stream(request, {
        onTextChunk: async (chunk) => {
          await this.chatService.appendAssistantChunk({
            messageId: assistantMessageId,
            chunk,
          });
        },
      });

      if (streamResult.toolCalls.length > 0) {
        if (!this.toolExecutor) {
          throw new Error("Tool calls were returned without a tool executor.");
        }

        this.gameEngineFacade.advancePipeline("VALIDATING_TOOLS");
        this.gameEngineFacade.advancePipeline("EXECUTING_COMMANDS");
        for (const toolCall of streamResult.toolCalls) {
          const result = await this.toolExecutor.execute(
            wrapToolCall(toolCall, request),
          );
          toolResults.push(result);

          if (!result.ok || !result.commitAck) {
            throw new Error("Tool execution failed before commitAck.");
          }
        }
      }

      const snapshot = this.gameEngineFacade.getSessionSnapshot();
      if (snapshot.sessionState === "GENERATING") {
        this.gameEngineFacade.completeAiRequest();
      }

      await this.chatService.finalizeAssistantMessage({
        messageId: assistantMessageId,
        commitAck: true,
      });

      return {
        ok: true,
        request,
        assistantMessageId,
        toolResults,
      };
    } catch (error) {
      await this.chatService.markAssistantFailedDraft({
        messageId: assistantMessageId,
      });
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
}
