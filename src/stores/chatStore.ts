import {
  ChatMessageService,
  type AppendAssistantChunkInput,
  type CreateBattleSummaryMessageInput,
  type CreateAssistantProvisionalMessageInput,
  type CreateUserMessageInput,
  type FinalizeAssistantMessageInput,
  type MarkAssistantFailedDraftInput,
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

const defaultRepository = new InMemoryChatHistoryRepository();
let activeRepository: ChatHistoryRepository = defaultRepository;
let activeService = new ChatMessageService(activeRepository);

function useInMemoryRepository(): void {
  activeRepository = defaultRepository;
  activeService = new ChatMessageService(activeRepository);
  defaultRepository.clear();
}

async function listMessages(): Promise<ChatMessage[]> {
  return activeRepository.list();
}

export const useChatStore = defineStore("chat", {
  state: () => {
    if (activeRepository instanceof InMemoryChatHistoryRepository) {
      useInMemoryRepository();
    }

    return {
      messages: [] as ChatMessage[],
    };
  },
  actions: {
    async configurePersistence(payload: { client: DbWorkerClient }) {
      activeRepository = new DbChatHistoryRepository(payload.client);
      activeService = new ChatMessageService(activeRepository);
      this.messages = await listMessages();
    },
    async createUserMessage(payload: CreateUserMessageInput) {
      const message = await activeService.createUserMessage(payload);
      this.messages = await listMessages();
      return message;
    },
    async createAssistantProvisionalMessage(
      payload: CreateAssistantProvisionalMessageInput,
    ) {
      const message =
        await activeService.createAssistantProvisionalMessage(payload);
      this.messages = await listMessages();
      return message;
    },
    async appendAssistantChunk(payload: AppendAssistantChunkInput) {
      const message = await activeService.appendAssistantChunk(payload);
      this.messages = await listMessages();
      return message;
    },
    async finalizeAssistantMessage(payload: FinalizeAssistantMessageInput) {
      const message = await activeService.finalizeAssistantMessage(payload);
      this.messages = await listMessages();
      return message;
    },
    async markAssistantFailedDraft(payload: MarkAssistantFailedDraftInput) {
      const message = await activeService.markAssistantFailedDraft(payload);
      this.messages = await listMessages();
      return message;
    },
    async createBattleSummaryMessages(
      payload: CreateBattleSummaryMessageInput[],
    ) {
      const messages = await activeService.createBattleSummaryMessages(payload);
      this.messages = await listMessages();
      return messages;
    },
    async refreshMessages() {
      this.messages = await listMessages();
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
    },
  },
});
