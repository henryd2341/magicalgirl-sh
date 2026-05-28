import { tool } from "ai";

import type { GameEngineFacade } from "@/engine/gameEngineFacade";
import {
  toTriggerBattleCommandPayload,
  toVariablePatchEnvelope,
  type TriggerBattleCommandResult,
  type TriggerBattleToolInput,
  type UpdateVariablesToolInput,
} from "@/orchestrator/toolEnvelope";
import {
  triggerBattleToolInputSchema,
  updateVariablesToolInputSchema,
} from "@/orchestrator/toolSchemas";
import type { VariablePatchResult } from "@/types/variables";

export interface HarnessToolExecutorDeps {
  dispatchCommand: GameEngineFacade["dispatchCommand"];
}

export interface UpdateVariablesExecuteInput {
  tool_call_id: string;
  input: UpdateVariablesToolInput;
  envelope: {
    request_id: string;
    context_version: number;
    state_hash: string;
  };
}

export function createHarnessToolsWithExecute(
  deps: HarnessToolExecutorDeps,
  requestMeta: {
    requestId: string;
    contextVersion: number;
    stateHash: string;
  },
) {
  return {
    update_variables: tool({
      description: createHarnessTools().update_variables.description,
      inputSchema: updateVariablesToolInputSchema,
      execute: async (input, options) => {
        const result = await deps.dispatchCommand({
          type: "APPLY_VARIABLE_PATCH",
          envelope: toVariablePatchEnvelope({
            tool_name: "update_variables",
            tool_call_id: options.toolCallId,
            request_id: requestMeta.requestId,
            context_version: requestMeta.contextVersion,
            state_hash: requestMeta.stateHash,
            input,
          }),
        });

        return {
          ok: true,
          tool_name: "update_variables",
          tool_call_id: options.toolCallId,
          commitAck: true,
          output: {
            next: result.next,
            nextHash: result.nextHash,
          },
        };
      },
    }),
    trigger_battle: tool({
      description: createHarnessTools().trigger_battle.description,
      inputSchema: triggerBattleToolInputSchema,
      execute: async (input, options) => {
        const result = await deps.dispatchCommand({
          type: "TRIGGER_BATTLE",
          payload: toTriggerBattleCommandPayload({
            tool_name: "trigger_battle",
            tool_call_id: options.toolCallId,
            request_id: requestMeta.requestId,
            context_version: requestMeta.contextVersion,
            state_hash: requestMeta.stateHash,
            input,
          }),
        });

        return {
          ok: true,
          tool_name: "trigger_battle",
          tool_call_id: options.toolCallId,
          commitAck: true,
          output: result,
        };
      },
    }),
  };
}

export interface TriggerBattleExecuteInput {
  tool_call_id: string;
  input: TriggerBattleToolInput;
  envelope: {
    request_id: string;
    context_version: number;
    state_hash: string;
  };
}

export interface UpdateVariablesExecuteResult {
  ok: true;
  tool_name: "update_variables";
  tool_call_id: string;
  commitAck: true;
  output: VariablePatchResult;
}

export interface TriggerBattleExecuteResult {
  ok: true;
  tool_name: "trigger_battle";
  tool_call_id: string;
  commitAck: true;
  output: TriggerBattleCommandResult;
}

export type HarnessToolExecuteResult =
  | UpdateVariablesExecuteResult
  | TriggerBattleExecuteResult;

export interface HarnessToolExecutors {
  update_variables: {
    // eslint-disable-next-line no-unused-vars
    execute(input: UpdateVariablesExecuteInput): Promise<UpdateVariablesExecuteResult>;
  };
  trigger_battle: {
    // eslint-disable-next-line no-unused-vars
    execute(input: TriggerBattleExecuteInput): Promise<TriggerBattleExecuteResult>;
  };
}

export function createHarnessTools() {
  return {
    update_variables: tool({
      description: [
        "Apply one or more variable patches to change game state.",
        "Each patch has a \"path\" (where to write) and a \"value\" (what to write).",
        "",
        "Writable paths (with types):",
        "  player.profile.name (string), player.profile.age (int), player.profile.gender (\"男\"|\"女\")",
        "  player.money (number >=0)",
        "  world.time.displayText/dayIndex/timeSlot (string/int/string)",
        "  world.location.id/name/description (string)",
        "  world.flags.<id>, player.flags.<id> (boolean)",
        "  player.relationships.<id> (integer 0-100)",
        "  inventory.items.<id> (positive int), inventory.battleItems.<id> (<= items.<id>)",
        "",
        "Read-only (visible in snapshot, do NOT patch): combat.level, combat.hp,",
        "  combat.mp, combat.attack, combat.defense, combat.agility, combat.intelligence",
        "",
        "Hidden (not visible, not writable): equipment, affairs, characters",
        "",
        "Input: { patches: [{ path: string, value: unknown }] }",
      ].join("\n"),
      inputSchema: updateVariablesToolInputSchema,
    }),
    trigger_battle: tool({
      description: [
        "Initiate a combat encounter. Places the game into pending battle state.",
        "",
        "Fields:",
        "  encounter_id (string) — Unique encounter identifier",
        "  enemies (array) — [{ enemy_id: string, count: int >=1 }]",
        "  modifiers (string[], optional) — Battle conditions",
        "  narrative_reason (string) — Why this battle is happening",
        "",
        "Example: { encounter_id: \"encounter_rooftop_shade\",",
        "  enemies: [{ enemy_id: \"shade_student\", count: 1 }],",
        "  modifiers: [\"first_battle\"],",
        "  narrative_reason: \"一只暗影生物从虫洞出现\" }",
      ].join("\n"),
      inputSchema: triggerBattleToolInputSchema,
    }),
  };
}

export function createHarnessToolExecutors(
  deps: HarnessToolExecutorDeps,
): HarnessToolExecutors {
  return {
    update_variables: {
      async execute(input) {
        const result = await deps.dispatchCommand({
          type: "APPLY_VARIABLE_PATCH",
          envelope: toVariablePatchEnvelope({
            tool_name: "update_variables",
            tool_call_id: input.tool_call_id,
            request_id: input.envelope.request_id,
            context_version: input.envelope.context_version,
            state_hash: input.envelope.state_hash,
            input: input.input,
          }),
        });

        return {
          ok: true as const,
          tool_name: "update_variables" as const,
          tool_call_id: input.tool_call_id,
          commitAck: true as const,
          output: {
            next: result.next,
            nextHash: result.nextHash,
          },
        };
      },
    },
    trigger_battle: {
      async execute(input) {
        const result = await deps.dispatchCommand({
          type: "TRIGGER_BATTLE",
          payload: toTriggerBattleCommandPayload({
            tool_name: "trigger_battle",
            tool_call_id: input.tool_call_id,
            request_id: input.envelope.request_id,
            context_version: input.envelope.context_version,
            state_hash: input.envelope.state_hash,
            input: input.input,
          }),
        });

        return {
          ok: true as const,
          tool_name: "trigger_battle" as const,
          tool_call_id: input.tool_call_id,
          commitAck: true as const,
          output: result,
        };
      },
    },
  };
}
