import {
  buildHarnessRequest,
  type BuildHarnessRequestInput,
} from "@/orchestrator/promptBuilder";
import type { PromptPresetRepository } from "@/orchestrator/promptPreset";

export interface BuildConfiguredHarnessRequestInput
  extends Omit<BuildHarnessRequestInput, "systemPrompt" | "budget"> {
  promptPresetRepository: PromptPresetRepository;
}

export async function buildConfiguredHarnessRequest(
  input: BuildConfiguredHarnessRequestInput,
) {
  const preset = await input.promptPresetRepository.getCurrent();

  return buildHarnessRequest({
    ...input,
    systemPrompt: preset.systemPrompt,
    budget: {
      maxTotalTokens: preset.maxTotalTokens,
    },
  });
}
