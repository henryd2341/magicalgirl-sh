import {
  ChatMessageService,
  type AppendAssistantChunkInput,
  type CreateAssistantProvisionalMessageInput,
  type CreateUserMessageInput,
  type FinalizeAssistantMessageInput,
  type MarkAssistantFailedDraftInput,
} from "@/engine/chatMessageService";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { ChatMessage } from "@/types/chat";
import { defineStore } from "pinia";

const repository = new InMemoryChatHistoryRepository();
const chatMessageService = new ChatMessageService(repository);

export const useChatStore = defineStore("chat", {
  state: () => {
    repository.clear();

    return {
      messages: [] as ChatMessage[],
    };
  },
  actions: {
    async createUserMessage(payload: CreateUserMessageInput) {
      const message = await chatMessageService.createUserMessage(payload);
      this.messages = await repository.list();
      return message;
    },
    async createAssistantProvisionalMessage(
      payload: CreateAssistantProvisionalMessageInput,
    ) {
      const message =
        await chatMessageService.createAssistantProvisionalMessage(payload);
      this.messages = await repository.list();
      return message;
    },
    async appendAssistantChunk(payload: AppendAssistantChunkInput) {
      const message = await chatMessageService.appendAssistantChunk(payload);
      this.messages = await repository.list();
      return message;
    },
    async finalizeAssistantMessage(payload: FinalizeAssistantMessageInput) {
      const message =
        await chatMessageService.finalizeAssistantMessage(payload);
      this.messages = await repository.list();
      return message;
    },
    async markAssistantFailedDraft(payload: MarkAssistantFailedDraftInput) {
      const message =
        await chatMessageService.markAssistantFailedDraft(payload);
      this.messages = await repository.list();
      return message;
    },
    async refreshMessages() {
      this.messages = await repository.list();
    },
  },
});
