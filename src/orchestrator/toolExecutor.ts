import type { GameEngineFacade } from "@/engine/gameEngineFacade";
import {
  type ToolEnvelope,
  type ToolExecutionError,
  type TriggerBattleToolEnvelope,
  type TriggerBattleToolResult,
  type UpdateVariablesToolEnvelope,
  type UpdateVariablesToolResult,
  toTriggerBattleCommandPayload,
  toVariablePatchEnvelope,
} from "@/orchestrator/toolEnvelope";
import { validateToolEnvelope } from "@/orchestrator/toolSchemas";

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

  public async execute(
    envelope: UpdateVariablesToolEnvelope,
  ): Promise<UpdateVariablesToolResult>;
  public async execute(
    envelope: TriggerBattleToolEnvelope,
  ): Promise<TriggerBattleToolResult>;
  public async execute(
    envelope: ToolEnvelope,
  ): Promise<UpdateVariablesToolResult | TriggerBattleToolResult> {
    try {
      switch (envelope.tool_name) {
        case "update_variables": {
          const validatedEnvelope = validateToolEnvelope(envelope);
          const result = await this.gameEngineFacade.dispatchCommand({
            type: "APPLY_VARIABLE_PATCH",
            envelope: toVariablePatchEnvelope(validatedEnvelope),
          });

          return {
            ok: true,
            tool_name: "update_variables",
            tool_call_id: validatedEnvelope.tool_call_id,
            commitAck: true,
            output: {
              next: result.next,
              nextHash: result.nextHash,
            },
          };
        }
        case "trigger_battle": {
          const validatedEnvelope = validateToolEnvelope(envelope);
          const result = await this.gameEngineFacade.dispatchCommand({
            type: "TRIGGER_BATTLE",
            payload: toTriggerBattleCommandPayload(validatedEnvelope),
          });

          return {
            ok: true,
            tool_name: "trigger_battle",
            tool_call_id: validatedEnvelope.tool_call_id,
            commitAck: true,
            output: result,
          };
        }
        default:
          throw new Error(
            `[TOOL_UNSUPPORTED] Unsupported tool: ${String(envelope.tool_name)}`,
          );
      }
    } catch (error) {
      return {
        ok: false,
        tool_name: envelope.tool_name,
        tool_call_id: envelope.tool_call_id,
        commitAck: false,
        error: parseToolExecutionError(error),
      };
    }
  }
}
