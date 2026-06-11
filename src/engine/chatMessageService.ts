import type { ChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { ChatBattleSummaryLevel, ChatMessage } from "@/types/chat";

export interface CreateUserMessageInput {
  id: string;
  content: string;
  userVisible?: boolean;
  aiVisible?: boolean;
  createdAt: string;
}

export interface CreateAssistantProvisionalMessageInput {
  id: string;
  requestId: string;
  createdAt: string;
}

export interface AppendAssistantChunkInput {
  messageId: string;
  chunk: string;
}

export interface AppendAssistantReasoningInput {
  messageId: string;
  chunk: string;
}

export interface FinalizeAssistantMessageInput {
  messageId: string;
  commitAck: boolean;
}

export interface MarkAssistantFailedDraftInput {
  messageId: string;
  errorMessage?: string;
}

export interface CreateBattleSummaryMessageInput {
  id: string;
  level: ChatBattleSummaryLevel;
  content: string;
  userVisible: boolean;
  aiVisible: boolean;
  createdAt: string;
}

export interface CreateContextSummaryMessageInput {
  id: string;
  content: string;
  createdAt: string;
}

export interface UpdateMessageContentInput {
  messageId: string;
  content: string;
}

function createChatLifecycleError(code: string, message: string): Error {
  return new Error(`[${code}] ${message}`);
}

export class ChatMessageService {
  private readonly repository: ChatHistoryRepository;

  public constructor(repository: ChatHistoryRepository) {
    this.repository = repository;
  }

  public async createUserMessage(
    input: CreateUserMessageInput,
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: input.id,
      role: "user",
      kind: "normal",
      content: input.content,
      user_visible: input.userVisible ?? true,
      ai_visible: input.aiVisible ?? true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: input.createdAt,
    };

    await this.repository.save(message);
    return message;
  }

  public async createAssistantProvisionalMessage(
    input: CreateAssistantProvisionalMessageInput,
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: input.id,
      role: "assistant",
      kind: "normal",
      content: "",
      user_visible: true,
      ai_visible: true,
      provisional: true,
      finalized: false,
      failed: false,
      request_id: input.requestId,
      created_at: input.createdAt,
    };

    await this.repository.save(message);
    return message;
  }

  public async appendAssistantChunk(
    input: AppendAssistantChunkInput,
  ): Promise<ChatMessage> {
    const message = await this.requireMessage(input.messageId);

    const updated: ChatMessage = {
      ...message,
      content: `${message.content}${input.chunk}`,
    };

    await this.repository.save(updated);
    return updated;
  }

  public async appendAssistantReasoning(
    input: AppendAssistantReasoningInput,
  ): Promise<ChatMessage> {
    const message = await this.requireMessage(input.messageId);
    const prev = message.reasoning ?? "";

    const updated: ChatMessage = {
      ...message,
      reasoning: `${prev}${input.chunk}`,
    };

    await this.repository.save(updated);
    return updated;
  }

  public async finalizeAssistantMessage(
    input: FinalizeAssistantMessageInput,
  ): Promise<ChatMessage> {
    if (!input.commitAck) {
      throw createChatLifecycleError(
        "CHAT_COMMIT_ACK_REQUIRED",
        "Assistant message cannot finalize before commitAck.",
      );
    }

    const message = await this.requireMessage(input.messageId);
    const updated: ChatMessage = {
      ...message,
      provisional: false,
      finalized: true,
      failed: false,
      kind: "normal",
    };

    await this.repository.save(updated);
    return updated;
  }

  public async markAssistantFailedDraft(
    input: MarkAssistantFailedDraftInput,
  ): Promise<ChatMessage> {
    const message = await this.requireMessage(input.messageId);
    const updated: ChatMessage = {
      ...message,
      kind: "failed_draft",
      content:
        message.content.trim().length > 0 || !input.errorMessage
          ? message.content
          : `生成失败：${input.errorMessage}`,
      provisional: false,
      finalized: false,
      failed: true,
      user_visible: true,
    };

    await this.repository.save(updated);
    return updated;
  }

  public async createBattleSummaryMessages(
    inputs: CreateBattleSummaryMessageInput[],
  ): Promise<ChatMessage[]> {
    const messages = inputs.map((input): ChatMessage => {
      return {
        id: input.id,
        role: "system",
        kind: "battle_summary",
        summary_level: input.level,
        content: input.content,
        user_visible: input.userVisible,
        ai_visible: input.aiVisible,
        provisional: false,
        finalized: true,
        failed: false,
        created_at: input.createdAt,
      };
    });

    for (const message of messages) {
      await this.repository.save(message);
    }

    return messages;
  }

  public async createContextSummaryMessage(
    input: CreateContextSummaryMessageInput,
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: input.id,
      role: "system",
      kind: "context_summary",
      content: input.content,
      user_visible: false,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: input.createdAt,
    };

    await this.repository.save(message);
    return message;
  }

  public async updateMessageContent(
    input: UpdateMessageContentInput,
  ): Promise<ChatMessage> {
    const message = await this.requireMessage(input.messageId);
    const updated: ChatMessage = { ...message, content: input.content };
    await this.repository.save(updated);
    return updated;
  }

  private async requireMessage(messageId: string): Promise<ChatMessage> {
    const message = await this.repository.getById(messageId);
    if (!message) {
      throw createChatLifecycleError(
        "CHAT_MESSAGE_NOT_FOUND",
        `Message not found: ${messageId}`,
      );
    }

    return message;
  }
}
