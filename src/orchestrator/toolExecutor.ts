import type { GameEngineFacade } from "@/engine/gameEngineFacade";
import {
  InMemoryToolCallExecutionLedger,
  type ToolCallExecutionLedger,
} from "@/engine/idempotencyService";
import {
  type ToolEnvelope,
  type ToolEnvelopeCandidate,
  type ToolExecutionError,
  type ToolExecutionFailureResult,
  type TriggerBattleToolEnvelope,
  type TriggerBattleToolResult,
  type UpdateVariablesToolEnvelope,
  type UpdateVariablesToolResult,
  toTriggerBattleCommandPayload,
  toVariablePatchEnvelope,
} from "@/orchestrator/toolEnvelope";
import { validateToolEnvelope } from "@/orchestrator/toolSchemas";

type UnknownToolResult =
  | UpdateVariablesToolResult
  | TriggerBattleToolResult
  | ToolExecutionFailureResult<string>;

type ToolExecutorResult<TEnvelope extends ToolEnvelopeCandidate> =
  TEnvelope extends UpdateVariablesToolEnvelope
    ? UpdateVariablesToolResult
    : TEnvelope extends TriggerBattleToolEnvelope
      ? TriggerBattleToolResult
      : UnknownToolResult;

export interface ToolExecutorDependencies {
  idempotencyLedger?: ToolCallExecutionLedger;
  now?: () => string;
}

function parseToolExecutionError(error: unknown): ToolExecutionError {
  if (error instanceof Error) {
    const match = error.message.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      return {
        code: match[1],
        message: error.message,
      };
    }

    return {
      code: "TOOL_EXECUTION_FAILED",
      message: error.message,
    };
  }

  return {
    code: "TOOL_EXECUTION_FAILED",
    message: "[TOOL_EXECUTION_FAILED] Unknown tool execution failure.",
  };
}

export class ToolExecutor {
  private readonly gameEngineFacade: GameEngineFacade;

  private readonly idempotencyLedger: ToolCallExecutionLedger;

  private readonly now: () => string;

  public constructor(
    gameEngineFacade: GameEngineFacade,
    dependencies: ToolExecutorDependencies = {},
  ) {
    this.gameEngineFacade = gameEngineFacade;
    this.idempotencyLedger =
      dependencies.idempotencyLedger ?? new InMemoryToolCallExecutionLedger();
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public async execute<TEnvelope extends ToolEnvelopeCandidate>(
    envelope: TEnvelope,
  ): Promise<ToolExecutorResult<TEnvelope>> {
    try {
      const validatedEnvelope = validateToolEnvelope(envelope);
      await this.assertExecutionContext(validatedEnvelope);

      switch (validatedEnvelope.tool_name) {
        case "update_variables": {
          const result = await this.gameEngineFacade.dispatchCommand({
            type: "APPLY_VARIABLE_PATCH",
            envelope: toVariablePatchEnvelope(validatedEnvelope),
          });

          const executionResult: UpdateVariablesToolResult = {
            ok: true,
            tool_name: "update_variables",
            tool_call_id: validatedEnvelope.tool_call_id,
            commitAck: true,
            output: {
              next: result.next,
              nextHash: result.nextHash,
            },
          };

          await this.recordSuccessfulExecution(validatedEnvelope);

          return executionResult as ToolExecutorResult<TEnvelope>;
        }
        case "trigger_battle": {
          const result = await this.gameEngineFacade.dispatchCommand({
            type: "TRIGGER_BATTLE",
            payload: toTriggerBattleCommandPayload(validatedEnvelope),
          });

          const executionResult: TriggerBattleToolResult = {
            ok: true,
            tool_name: "trigger_battle",
            tool_call_id: validatedEnvelope.tool_call_id,
            commitAck: true,
            output: result,
          };

          await this.recordSuccessfulExecution(validatedEnvelope);

          return executionResult as ToolExecutorResult<TEnvelope>;
        }
      }
    } catch (error) {
      return {
        ok: false,
        tool_name: envelope.tool_name,
        tool_call_id: envelope.tool_call_id,
        commitAck: false,
        error: parseToolExecutionError(error),
      } as ToolExecutorResult<TEnvelope>;
    }
  }

  private async assertExecutionContext(envelope: ToolEnvelope): Promise<void> {
    if (await this.idempotencyLedger.hasSucceeded(envelope.tool_call_id)) {
      throw new Error(
        `[TOOL_CALL_DUPLICATE] Tool call ${envelope.tool_call_id} was already committed.`,
      );
    }

    const sessionSnapshot = this.gameEngineFacade.getSessionSnapshot();
    if (
      sessionSnapshot.activeRequestId !== null &&
      sessionSnapshot.activeRequestId !== envelope.request_id
    ) {
      throw new Error(
        `[TOOL_CONTEXT_EXPIRED] Tool call request_id ${envelope.request_id} does not match active request ${sessionSnapshot.activeRequestId}.`,
      );
    }

    const currentStateHash =
      await this.gameEngineFacade.getCurrentVariableStateHash();
    if (envelope.state_hash !== currentStateHash) {
      throw new Error(
        `[TOOL_CONTEXT_EXPIRED] Tool call state_hash ${envelope.state_hash} does not match current state_hash ${currentStateHash}.`,
      );
    }
  }

  private async recordSuccessfulExecution(envelope: ToolEnvelope): Promise<void> {
    await this.idempotencyLedger.recordSuccess({
      toolCallId: envelope.tool_call_id,
      requestId: envelope.request_id,
      toolName: envelope.tool_name,
      recordedAt: this.now(),
    });
  }
}
