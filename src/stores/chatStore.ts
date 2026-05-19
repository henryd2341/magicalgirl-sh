import { ChatMessageService } from "@/engine/chatMessageService";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { ChatMessage } from "@/types/chat";
import { defineStore } from "pinia";

const repository = new InMemoryChatHistoryRepository();
const chatMessageService = new ChatMessageService(repository);

export const useChatStore = defineStore("chat", {
  state: () => ({
    messages: [] as ChatMessage[],
  }),
  actions: {
    async createUserMessage(payload: {
      id: string;
      content: string;
      createdAt: string;
    }) {
      const message = await chatMessageService.createUserMessage(payload);
      this.messages = await repository.list();
      return message;
    },
    async refreshMessages() {
      this.messages = await repository.list();
    },
  },
});
