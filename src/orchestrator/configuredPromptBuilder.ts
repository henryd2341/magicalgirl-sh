import {
  buildHarnessRequest,
  type BuildHarnessRequestInput,
} from "@/orchestrator/promptBuilder";
import type { PromptPresetRepository } from "@/orchestrator/promptPreset";
import type { SkillMetadata } from "@/orchestrator/skillRegistry";

export interface BuildConfiguredHarnessRequestInput
  extends Omit<BuildHarnessRequestInput, "systemPrompt" | "budget"> {
  promptPresetRepository: PromptPresetRepository;
  skillMetadata?: SkillMetadata[];
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
    skillMetadata: input.skillMetadata,
    customChainOfThought: preset.customChainOfThought,
  });
}
