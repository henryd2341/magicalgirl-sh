import type { BuiltProviderRequest } from "@/orchestrator/harnessContextTypes";
import type { PromptViewerProviderInfo } from "@/orchestrator/providerSettings";
import { deepClone } from "@/utils/deepClone";
import { defineStore } from "pinia";

export const usePromptViewerStore = defineStore("prompt-viewer", {
  state: () => ({
    lastRequest: null as BuiltProviderRequest | null,
    lastProviderInfo: null as PromptViewerProviderInfo | null,
  }),
  actions: {
    record(
      request: BuiltProviderRequest,
      providerInfo: PromptViewerProviderInfo | null = null,
    ) {
      this.lastRequest = deepClone(request);
      this.lastProviderInfo = providerInfo ? deepClone(providerInfo) : null;
    },
    clear() {
      this.lastRequest = null;
      this.lastProviderInfo = null;
    },
  },
});
