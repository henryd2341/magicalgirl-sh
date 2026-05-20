import type {
  ToolEnvelope,
  TriggerBattleEnemyInput,
  TriggerBattleToolEnvelope,
  TriggerBattleToolInput,
  UpdateVariablesToolEnvelope,
  UpdateVariablesToolInput,
} from "@/orchestrator/toolEnvelope";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateUpdateVariablesToolInput(
  input: unknown,
): UpdateVariablesToolInput {
  if (!isRecord(input)) {
    throw new Error(
      "[TOOL_INPUT_INVALID] update_variables input must be an object.",
    );
  }

  const { patches } = input;
  if (!Array.isArray(patches) || patches.length === 0) {
    throw new Error(
      "[TOOL_INPUT_INVALID] update_variables input.patches must be a non-empty array.",
    );
  }

  for (const patch of patches) {
    if (!isRecord(patch) || typeof patch.path !== "string") {
      throw new Error(
        "[TOOL_INPUT_INVALID] each update_variables patch must include a string path.",
      );
    }
  }

  return {
    patches: patches.map((patch) => ({
      path: patch.path as string,
      value: patch.value,
    })),
  };
}

function validateTriggerBattleEnemyInput(
  input: unknown,
): TriggerBattleEnemyInput {
  if (!isRecord(input)) {
    throw new Error(
      "[TOOL_INPUT_INVALID] each trigger_battle enemy must be an object.",
    );
  }

  const enemyId = input.enemy_id;
  const count = input.count;

  if (typeof enemyId !== "string" || enemyId.length === 0) {
    throw new Error(
      "[TOOL_INPUT_INVALID] each trigger_battle enemy must include enemy_id.",
    );
  }

  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
    throw new Error(
      "[TOOL_INPUT_INVALID] each trigger_battle enemy count must be a positive integer.",
    );
  }

  return {
    enemy_id: enemyId,
    count,
  };
}

export function validateTriggerBattleToolInput(
  input: unknown,
): TriggerBattleToolInput {
  if (!isRecord(input)) {
    throw new Error(
      "[TOOL_INPUT_INVALID] trigger_battle input must be an object.",
    );
  }

  if ("enemy_group_id" in input) {
    throw new Error(
      "[TOOL_INPUT_INVALID] trigger_battle does not allow enemy_group_id in the frozen contract.",
    );
  }

  if ("level_policy" in input) {
    throw new Error(
      "[TOOL_INPUT_INVALID] trigger_battle does not allow level_policy in the frozen contract.",
    );
  }

  const encounterId = input.encounter_id;
  const enemies = input.enemies;
  const narrativeReason = input.narrative_reason;
  const modifiers = input.modifiers;

  if (typeof encounterId !== "string" || encounterId.length === 0) {
    throw new Error(
      "[TOOL_INPUT_INVALID] trigger_battle encounter_id is required.",
    );
  }

  if (!Array.isArray(enemies) || enemies.length === 0) {
    throw new Error(
      "[TOOL_INPUT_INVALID] trigger_battle enemies must be a non-empty array.",
    );
  }

  if (typeof narrativeReason !== "string" || narrativeReason.length === 0) {
    throw new Error(
      "[TOOL_INPUT_INVALID] trigger_battle narrative_reason is required.",
    );
  }

  if (modifiers !== undefined && !isRecord(modifiers)) {
    throw new Error(
      "[TOOL_INPUT_INVALID] trigger_battle modifiers must be an object when provided.",
    );
  }

  return {
    encounter_id: encounterId,
    enemies: enemies.map((enemy) => validateTriggerBattleEnemyInput(enemy)),
    modifiers,
    narrative_reason: narrativeReason,
  };
}

export function validateToolEnvelope(
  _envelope: UpdateVariablesToolEnvelope,
): UpdateVariablesToolEnvelope;
export function validateToolEnvelope(
  _envelope: TriggerBattleToolEnvelope,
): TriggerBattleToolEnvelope;
export function validateToolEnvelope(envelope: ToolEnvelope): ToolEnvelope {
  if (!envelope.request_id || !envelope.tool_call_id) {
    throw new Error(
      "[TOOL_ENVELOPE_INVALID] request_id and tool_call_id are required.",
    );
  }

  if (
    !Number.isInteger(envelope.context_version) ||
    envelope.context_version < 1
  ) {
    throw new Error(
      "[TOOL_ENVELOPE_INVALID] context_version must be a positive integer.",
    );
  }

  if (
    typeof envelope.state_hash !== "string" ||
    envelope.state_hash.length === 0
  ) {
    throw new Error("[TOOL_ENVELOPE_INVALID] state_hash is required.");
  }

  switch (envelope.tool_name) {
    case "update_variables": {
      const validatedEnvelope: UpdateVariablesToolEnvelope = {
        ...envelope,
        input: validateUpdateVariablesToolInput(envelope.input),
      };
      return validatedEnvelope;
    }
    case "trigger_battle": {
      const validatedEnvelope: TriggerBattleToolEnvelope = {
        ...envelope,
        input: validateTriggerBattleToolInput(envelope.input),
      };
      return validatedEnvelope;
    }
  }
}
