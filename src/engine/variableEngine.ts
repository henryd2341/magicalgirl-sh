import {
  createDefaultGameVariablesRoot,
  validateGameVariablesRoot,
  validateVariablePathPatch,
} from "@/engine/variablePolicy";
import { deepClone } from "@/utils/deepClone";
import type {
  GameVariablesRoot,
  PreviousValueMap,
  VariablePatchEnvelope,
  VariablePatchResult,
  VariableValueRecord,
} from "@/types/variables";

export interface ApplyPatchSetInput {
  current: VariableValueRecord;
  envelope: VariablePatchEnvelope;
}

function createVariableError(code: string, message: string): Error {
  return new Error(`[${code}] ${message}`);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableStringify(entryValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function computeStateHash(root: GameVariablesRoot, version: number): string {
  if (
    version === 1 &&
    stableStringify(root) === stableStringify(createDefaultGameVariablesRoot())
  ) {
    return "initial";
  }

  const source = `${version}:${stableStringify(root)}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `state-${hash.toString(16)}`;
}

function getValueAtPath(
  root: GameVariablesRoot,
  path: string,
): unknown {
  const segments = path.split(".");
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setValueAtPath(
  root: GameVariablesRoot,
  path: string,
  value: unknown,
): void {
  const segments = path.split(".");
  let current: Record<string, unknown> = root as unknown as Record<
    string,
    unknown
  >;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = current[segment];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}

export class VariableEngine {
  public createInitialState(): VariableValueRecord {
    return {
      rootId: "game_variables_root",
      version: 1,
      stateHash: "initial",
      updatedAt: "1970-01-01T00:00:00.000Z",
      root: createDefaultGameVariablesRoot(),
    };
  }

  public applyPatchSet(input: ApplyPatchSetInput): VariablePatchResult {
    if (input.envelope.state_hash !== input.current.stateHash) {
      throw createVariableError(
        "VARIABLE_STATE_HASH_MISMATCH",
        "Provided state_hash does not match current variable state.",
      );
    }

    const nextRoot = deepClone(input.current.root);
    const previousValues: PreviousValueMap = new Map();
    for (const patch of input.envelope.patches) {
      validateVariablePathPatch(nextRoot, patch);
      const oldValue = getValueAtPath(input.current.root, patch.path);
      if (typeof oldValue === "number") {
        previousValues.set(patch.path, oldValue);
      }
      setValueAtPath(nextRoot, patch.path, patch.value);
    }

    validateGameVariablesRoot(nextRoot);

    const nextVersion = input.current.version + 1;
    const nextHash = computeStateHash(nextRoot, nextVersion);
    const next: VariableValueRecord = {
      rootId: input.current.rootId,
      version: nextVersion,
      stateHash: nextHash,
      updatedAt: new Date().toISOString(),
      root: nextRoot,
    };

    return {
      next,
      nextHash,
      previousValues,
    };
  }
}
