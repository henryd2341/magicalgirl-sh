import type { GameEngineFacade } from "@/engine/gameEngineFacade";
import {
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

  public constructor(gameEngineFacade: GameEngineFacade) {
    this.gameEngineFacade = gameEngineFacade;
  }

  public async execute<TEnvelope extends ToolEnvelopeCandidate>(
    envelope: TEnvelope,
  ): Promise<ToolExecutorResult<TEnvelope>> {
    try {
      const validatedEnvelope = validateToolEnvelope(envelope);

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
}
