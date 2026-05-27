import { VariableEngine } from "@/engine/variableEngine";
import type { VariableRepository } from "@/persistence/repositories/variableRepository";
import type {
  WorldInfoEntry,
  WorldInfoRepository,
} from "@/persistence/repositories/worldInfoRepository";
import type { VariableValueRecord } from "@/types/variables";

const MALE_USER_ENTRY_ID = "raw_entries/男user";
const FEMALE_USER_ENTRY_ID = "raw_entries/女user";

export interface SyncPlayerGenderWorldInfoActivationInput {
  variableRepository: VariableRepository;
  worldInfoRepository: WorldInfoRepository;
  variableState?: VariableValueRecord;
}

function shouldEnableEntry(entry: WorldInfoEntry, gender: "男" | "女"): boolean {
  if (entry.id === MALE_USER_ENTRY_ID) {
    return gender === "男";
  }

  if (entry.id === FEMALE_USER_ENTRY_ID) {
    return gender === "女";
  }

  return entry.enabled;
}

export async function syncPlayerGenderWorldInfoActivation(
  input: SyncPlayerGenderWorldInfoActivationInput,
): Promise<void> {
  const variableState =
    input.variableState ??
    (await input.variableRepository.getCurrent()) ??
    new VariableEngine().createInitialState();
  const gender = variableState.root.player.profile.gender;
  const entries = await input.worldInfoRepository.list();

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.id === MALE_USER_ENTRY_ID || entry.id === FEMALE_USER_ENTRY_ID,
      )
      .map((entry) =>
        input.worldInfoRepository.save({
          ...entry,
          enabled: shouldEnableEntry(entry, gender),
        }),
      ),
  );
}
