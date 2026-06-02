import { z, type ZodIssue } from "zod";

import type {
  ToolEnvelopeCandidate,
  ToolEnvelope,
  ReadSkillToolEnvelope,
  ReadSkillToolInput,
  TriggerBattleToolEnvelope,
  TriggerBattleToolInput,
  UpdateVariablesToolEnvelope,
  UpdateVariablesToolInput,
} from "@/orchestrator/toolEnvelope";

export const updateVariablesToolInputSchema = z
  .object({
    patches: z
      .array(
        z
          .object({
            path: z.string().min(1),
            value: z.unknown(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const triggerBattleToolInputSchema = z
  .object({
    encounter_id: z.string().min(1),
    enemies: z
      .array(
        z
          .object({
            enemy_id: z.string().min(1),
            count: z.number().int().min(1),
          })
          .strict(),
      )
      .min(1),
    modifiers: z.array(z.string().min(1)).optional(),
    narrative_reason: z.string().min(1),
  })
  .strict();

export const readSkillToolInputSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict();

const toolEnvelopeBaseSchema = z
  .object({
    tool_name: z.string().min(1),
    request_id: z.string().min(1),
    context_version: z.number().int().min(1),
    state_hash: z.string().min(1),
    tool_call_id: z.string().min(1),
    issued_at: z.string().optional(),
    input: z.unknown().optional(),
  })
  .passthrough();

function firstIssue(error: z.ZodError): ZodIssue {
  return error.issues[0];
}

function hasPath(issue: ZodIssue, path: string): boolean {
  return issue.path.map(String).join(".").startsWith(path);
}

function formatZodIssue(issue: ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    return `unsupported field(s): ${issue.keys.join(", ")}`;
  }

  const path = issue.path.map(String).join(".");
  if (path.length > 0) {
    return `${path}: ${issue.message}`;
  }

  return issue.message;
}

function updateVariablesInputError(error: z.ZodError): Error {
  const issue = firstIssue(error);

  if (issue.path.length === 0) {
    return new Error(
      "[TOOL_INPUT_INVALID] update_variables input must be an object.",
    );
  }

  if (hasPath(issue, "patches")) {
    if (issue.path.length === 1) {
      return new Error(
        "[TOOL_INPUT_INVALID] update_variables input.patches must be a non-empty array.",
      );
    }

    if (issue.path.includes("path")) {
      return new Error(
        "[TOOL_INPUT_INVALID] each update_variables patch must include a string path.",
      );
    }
  }

  return new Error(
    `[TOOL_INPUT_INVALID] update_variables ${formatZodIssue(issue)}.`,
  );
}

function triggerBattleInputError(error: z.ZodError): Error {
  const issue = firstIssue(error);

  if (issue.path.length === 0) {
    if (issue.code === "unrecognized_keys") {
      if (issue.keys.includes("enemy_group_id")) {
        return new Error(
          "[TOOL_INPUT_INVALID] trigger_battle does not allow enemy_group_id in the frozen contract.",
        );
      }

      if (issue.keys.includes("level_policy")) {
        return new Error(
          "[TOOL_INPUT_INVALID] trigger_battle does not allow level_policy in the frozen contract.",
        );
      }

      return new Error(
        `[TOOL_INPUT_INVALID] trigger_battle input ${formatZodIssue(issue)}.`,
      );
    }

    return new Error(
      "[TOOL_INPUT_INVALID] trigger_battle input must be an object.",
    );
  }

  if (hasPath(issue, "encounter_id")) {
    return new Error(
      "[TOOL_INPUT_INVALID] trigger_battle encounter_id is required.",
    );
  }

  if (hasPath(issue, "enemies")) {
    if (issue.path.length === 1) {
      return new Error(
        "[TOOL_INPUT_INVALID] trigger_battle enemies must be a non-empty array.",
      );
    }

    if (issue.path.includes("enemy_id")) {
      return new Error(
        "[TOOL_INPUT_INVALID] each trigger_battle enemy must include enemy_id.",
      );
    }

    if (issue.path.includes("count")) {
      return new Error(
        "[TOOL_INPUT_INVALID] each trigger_battle enemy count must be a positive integer.",
      );
    }

    return new Error(
      "[TOOL_INPUT_INVALID] each trigger_battle enemy must be an object.",
    );
  }

  if (hasPath(issue, "modifiers")) {
    return new Error(
      "[TOOL_INPUT_INVALID] trigger_battle modifiers must be an array of strings when provided.",
    );
  }

  if (hasPath(issue, "narrative_reason")) {
    return new Error(
      "[TOOL_INPUT_INVALID] trigger_battle narrative_reason is required.",
    );
  }

  return new Error(
    `[TOOL_INPUT_INVALID] trigger_battle ${formatZodIssue(issue)}.`,
  );
}

function toolEnvelopeError(error: z.ZodError): Error {
  const issue = firstIssue(error);

  if (hasPath(issue, "request_id") || hasPath(issue, "tool_call_id")) {
    return new Error(
      "[TOOL_ENVELOPE_INVALID] request_id and tool_call_id are required.",
    );
  }

  if (hasPath(issue, "context_version")) {
    return new Error(
      "[TOOL_ENVELOPE_INVALID] context_version must be a positive integer.",
    );
  }

  if (hasPath(issue, "state_hash")) {
    return new Error("[TOOL_ENVELOPE_INVALID] state_hash is required.");
  }

  return new Error(
    `[TOOL_ENVELOPE_INVALID] tool envelope ${formatZodIssue(issue)}.`,
  );
}

export function validateUpdateVariablesToolInput(
  input: unknown,
): UpdateVariablesToolInput {
  const result = updateVariablesToolInputSchema.safeParse(input);
  if (!result.success) {
    throw updateVariablesInputError(result.error);
  }

  return result.data;
}

export function validateTriggerBattleToolInput(
  input: unknown,
): TriggerBattleToolInput {
  const result = triggerBattleToolInputSchema.safeParse(input);
  if (!result.success) {
    throw triggerBattleInputError(result.error);
  }

  return result.data;
}

export function validateReadSkillToolInput(
  input: unknown,
): ReadSkillToolInput {
  const result = readSkillToolInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      "[TOOL_INPUT_INVALID] read_skill input must include a string name.",
    );
  }

  return result.data;
}

export function validateToolEnvelope(
  envelope: ToolEnvelopeCandidate,
): ToolEnvelope {
  const baseResult = toolEnvelopeBaseSchema.safeParse(envelope);
  if (!baseResult.success) {
    throw toolEnvelopeError(baseResult.error);
  }

  const parsed = baseResult.data;

  switch (parsed.tool_name) {
    case "update_variables": {
      const validatedEnvelope: UpdateVariablesToolEnvelope = {
        tool_name: "update_variables",
        request_id: parsed.request_id,
        context_version: parsed.context_version,
        state_hash: parsed.state_hash,
        tool_call_id: parsed.tool_call_id,
        issued_at: parsed.issued_at,
        input: validateUpdateVariablesToolInput(parsed.input),
      };
      return validatedEnvelope;
    }
    case "trigger_battle": {
      const validatedEnvelope: TriggerBattleToolEnvelope = {
        tool_name: "trigger_battle",
        request_id: parsed.request_id,
        context_version: parsed.context_version,
        state_hash: parsed.state_hash,
        tool_call_id: parsed.tool_call_id,
        issued_at: parsed.issued_at,
        input: validateTriggerBattleToolInput(parsed.input),
      };
      return validatedEnvelope;
    }
    case "read_skill": {
      const validatedEnvelope: ReadSkillToolEnvelope = {
        tool_name: "read_skill",
        request_id: parsed.request_id,
        context_version: parsed.context_version,
        state_hash: parsed.state_hash,
        tool_call_id: parsed.tool_call_id,
        issued_at: parsed.issued_at,
        input: validateReadSkillToolInput(parsed.input),
      };
      return validatedEnvelope;
    }
    default:
      throw new Error(
        `[TOOL_UNSUPPORTED] Unsupported tool: ${String(envelope.tool_name)}`,
      );
  }
}
