import { VariableEngine } from "@/engine/variableEngine";
import type { VariableRepository } from "@/persistence/repositories/variableRepository";
import type { VariableValueRecord } from "@/types/variables";

export interface EnsureVariableStateOptions {
  now?: () => string;
}

export async function ensureVariableState(
  repository: VariableRepository,
  options: EnsureVariableStateOptions = {},
): Promise<VariableValueRecord> {
  const existing = await repository.getCurrent();

  if (existing) {
    return existing;
  }

  const now = options.now ?? (() => new Date().toISOString());
  const initial = {
    ...new VariableEngine().createInitialState(),
    updatedAt: now(),
  };

  await repository.saveCurrent(initial);

  return initial;
}
