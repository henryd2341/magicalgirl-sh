import {
  ChatMessageService,
  type AppendAssistantReasoningInput,
  type AppendAssistantChunkInput,
  type CreateBattleSummaryMessageInput,
  type CreateContextSummaryMessageInput,
  type CreateAssistantProvisionalMessageInput,
  type CreateUserMessageInput,
  type FinalizeAssistantMessageInput,
  type MarkAssistantFailedDraftInput,
  type UpdateMessageContentInput,
} from "@/engine/chatMessageService";
import type { DbWorkerClient } from "@/persistence/dbClient";
import {
  DbChatHistoryRepository,
  InMemoryChatHistoryRepository,
  type ChatHistoryRepository,
} from "@/persistence/repositories/chatHistoryRepository";
import type { ChatMessage } from "@/types/chat";
import { defineStore } from "pinia";

export interface ActiveChatRuntime {
  repository: ChatHistoryRepository;
  service: ChatMessageService;
}

let activeRepository: ChatHistoryRepository = new InMemoryChatHistoryRepository();
let activeService = new ChatMessageService(activeRepository);
let runtimeVersion = 0;
let mutationVersion = 0;

function useInMemoryRepository(): void {
  activeRepository = new InMemoryChatHistoryRepository();
  activeService = new ChatMessageService(activeRepository);
  runtimeVersion++;
}

export const useChatStore = defineStore("chat", {
  state: () => {
    if (activeRepository instanceof InMemoryChatHistoryRepository) {
      useInMemoryRepository();
    }

    return {
      messages: [] as ChatMessage[],
      historyEpoch: 0,
    };
  },
  actions: {
    async configurePersistence(payload: { client: DbWorkerClient }) {
      activeRepository = new DbChatHistoryRepository(payload.client);
      activeService = new ChatMessageService(activeRepository);
      runtimeVersion++;
      await this.refreshMessages();
    },
    async createUserMessage(payload: CreateUserMessageInput) {
      const message = await activeService.createUserMessage(payload);
      await this.refreshMessages();
      return message;
    },
    async createAssistantProvisionalMessage(
      payload: CreateAssistantProvisionalMessageInput,
    ) {
      const message =
        await activeService.createAssistantProvisionalMessage(payload);
      await this.refreshMessages();
      return message;
    },
    async appendAssistantChunk(payload: AppendAssistantChunkInput) {
      const version = runtimeVersion;
      const epoch = this.historyEpoch;
      const message = await activeService.appendAssistantChunk(payload);
      if (version === runtimeVersion && epoch === this.historyEpoch) {
        mutationVersion++;
        const index = this.messages.findIndex(row => row.id === message.id);
        if (index >= 0) this.messages[index] = message;
        else await this.refreshMessages();
      }
      return message;
    },
    async appendAssistantReasoning(payload: AppendAssistantReasoningInput) {
      const version = runtimeVersion;
      const epoch = this.historyEpoch;
      const message = await activeService.appendAssistantReasoning(payload);
      if (version === runtimeVersion && epoch === this.historyEpoch) {
        mutationVersion++;
        const index = this.messages.findIndex(row => row.id === message.id);
        if (index >= 0) this.messages[index] = message;
        else await this.refreshMessages();
      }
      return message;
    },
    async finalizeAssistantMessage(payload: FinalizeAssistantMessageInput) {
      const message = await activeService.finalizeAssistantMessage(payload);
      await this.refreshMessages();
      return message;
    },
    async markAssistantFailedDraft(payload: MarkAssistantFailedDraftInput) {
      const message = await activeService.markAssistantFailedDraft(payload);
      await this.refreshMessages();
      return message;
    },
    async createBattleSummaryMessages(
      payload: CreateBattleSummaryMessageInput[],
    ) {
      const messages = await activeService.createBattleSummaryMessages(payload);
      await this.refreshMessages();
      return messages;
    },
    async createContextSummaryMessage(
      payload: CreateContextSummaryMessageInput,
    ) {
      const message = await activeService.createContextSummaryMessage(payload);
      await this.refreshMessages();
      return message;
    },
    async refreshMessages(options?: { replaceHistory?: boolean }) {
      if (options?.replaceHistory) runtimeVersion++;
      const version = runtimeVersion;
      const epoch = this.historyEpoch;
      let revision: number;
      let messages: ChatMessage[];
      do {
        revision = mutationVersion;
        messages = await activeRepository.list();
        if (version !== runtimeVersion || epoch !== this.historyEpoch) return;
      } while (revision !== mutationVersion);
      this.messages = messages;
      if (options?.replaceHistory) this.historyEpoch++;
    },
    async updateMessageContent(payload: UpdateMessageContentInput) {
      await activeService.updateMessageContent(payload);
      await this.refreshMessages();
    },
    getActiveChatRuntime(): ActiveChatRuntime {
      return {
        repository: activeRepository,
        service: activeService,
      };
    },
    resetToInMemoryPersistence() {
      useInMemoryRepository();
      this.messages = [];
      this.historyEpoch++;
    },
  },
});
