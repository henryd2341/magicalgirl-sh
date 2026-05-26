import type { BuiltProviderRequest } from "@/orchestrator/harnessContextTypes";
import { deepClone } from "@/utils/deepClone";
import { defineStore } from "pinia";

export const usePromptViewerStore = defineStore("prompt-viewer", {
  state: () => ({
    lastRequest: null as BuiltProviderRequest | null,
  }),
  actions: {
    record(request: BuiltProviderRequest) {
      this.lastRequest = deepClone(request);
    },
    clear() {
      this.lastRequest = null;
    },
  },
});
