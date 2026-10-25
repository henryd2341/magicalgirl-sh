import type { InputValidationError, VariablePatchRejectedError } from "@/engine/inputValidationError";
import type {
  VariablePatchEnvelope,
  VariablePatchResult,
  VariablePathPatch,
} from "@/types/variables";

export interface UpdateVariablesToolInput {
  patches: VariablePathPatch[];
}

export interface TriggerBattleEnemyInput {
  enemy_id: string;
  count: number;
}

export interface TriggerBattleToolInput {
  encounter_id: string;
  enemies: TriggerBattleEnemyInput[];
  modifiers?: string[];
  narrative_reason: string;
}

export interface TriggerBattleCommandPayload {
  request_id: string;
  context_version: number;
  state_hash: string;
  tool_call_id: string;
  input: TriggerBattleToolInput;
}

export interface TriggerBattleCommandResult {
  accepted: true;
  battleState: "pending";
  encounterId: string;
}

export interface ReadSkillToolInput {
  name: string;
}

export interface ReadSkillToolEnvelope extends BaseToolEnvelope {
  tool_name: "read_skill";
  input: ReadSkillToolInput;
}

export interface BaseToolEnvelope {
  tool_name: string;
  request_id: string;
  context_version: number;
  state_hash: string;
  tool_call_id: string;
  issued_at?: string;
}

export interface ToolEnvelopeCandidate extends BaseToolEnvelope {
  input?: unknown;
}

export interface UpdateVariablesToolEnvelope extends BaseToolEnvelope {
  tool_name: "update_variables";
  input: UpdateVariablesToolInput;
}

export interface TriggerBattleToolEnvelope extends BaseToolEnvelope {
  tool_name: "trigger_battle";
  input: TriggerBattleToolInput;
}

export type ToolEnvelope =
  | UpdateVariablesToolEnvelope
  | TriggerBattleToolEnvelope
  | ReadSkillToolEnvelope;

export interface ToolExecutionSuccessResult<TToolName extends string, TOutput> {
  ok: true;
  tool_name: TToolName;
  tool_call_id: string;
  commitAck: true;
  output: TOutput;
}

export interface ToolExecutionError {
  code: string;
  message: string;
}

export interface ToolExecutionFailureResult<TToolName extends string> {
  ok: false;
  tool_name: TToolName;
  tool_call_id: string;
  commitAck: false;
  failureKind?: "input-rejected-before-write";
  error: ToolExecutionError;
}

export type ToolExecutionResult<TToolName extends string, TOutput> =
  | ToolExecutionSuccessResult<TToolName, TOutput>
  | ToolExecutionFailureResult<TToolName>;

export function rejectedToolInput<TToolName extends string>(
  toolName: TToolName,
  toolCallId: string,
  error: InputValidationError | VariablePatchRejectedError,
): ToolExecutionFailureResult<TToolName> {
  return {
    ok: false,
    tool_name: toolName,
    tool_call_id: toolCallId,
    commitAck: false,
    failureKind: "input-rejected-before-write",
    error: { code: error.code, message: error.message },
  };
}

export type UpdateVariablesToolResult = ToolExecutionResult<
  "update_variables",
  VariablePatchResult & { patches: VariablePathPatch[] }
>;

export type TriggerBattleToolResult = ToolExecutionResult<
  "trigger_battle",
  TriggerBattleCommandResult
>;

export function toVariablePatchEnvelope(
  envelope: UpdateVariablesToolEnvelope,
): VariablePatchEnvelope {
  return {
    request_id: envelope.request_id,
    context_version: envelope.context_version,
    state_hash: envelope.state_hash,
    tool_call_id: envelope.tool_call_id,
    bypassAllowlist: true,
    patches: envelope.input.patches,
  };
}

export function toTriggerBattleCommandPayload(
  envelope: TriggerBattleToolEnvelope,
): TriggerBattleCommandPayload {
  return {
    request_id: envelope.request_id,
    context_version: envelope.context_version,
    state_hash: envelope.state_hash,
    tool_call_id: envelope.tool_call_id,
    input: envelope.input,
  };
}
