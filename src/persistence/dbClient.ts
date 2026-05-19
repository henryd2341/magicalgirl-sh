import type {
  DbInitResult,
  DbWorkerEndpoint,
  DbWorkerRequest,
  DbWorkerResponse,
  TestRecordRow,
} from "@/persistence/dbProtocol";
import type { ChatMessage } from "@/types/chat";

export class DbWorkerClient {
  private readonly endpoint: DbWorkerEndpoint;

  public constructor(endpoint: DbWorkerEndpoint) {
    this.endpoint = endpoint;
  }

  public async initialize(): Promise<DbInitResult> {
    const response = await this.dispatch({ type: "initialize" });

    if (response.type !== "initialize_result") {
      throw new Error(
        `Unexpected response type for initialize: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async insertTestRecord(record: TestRecordRow): Promise<void> {
    const response = await this.dispatch({
      type: "insert_test_record",
      payload: record,
    });

    if (response.type !== "insert_test_record_result") {
      throw new Error(`Unexpected response type for insert: ${response.type}`);
    }
  }

  public async listTestRecords(): Promise<TestRecordRow[]> {
    const response = await this.dispatch({ type: "list_test_records" });

    if (response.type !== "list_test_records_result") {
      throw new Error(`Unexpected response type for list: ${response.type}`);
    }

    return response.payload;
  }

  public async saveChatMessage(message: ChatMessage): Promise<void> {
    const response = await this.dispatch({
      type: "save_chat_message",
      payload: message,
    });

    if (response.type !== "save_chat_message_result") {
      throw new Error(
        `Unexpected response type for saveChatMessage: ${response.type}`,
      );
    }
  }

  public async getChatMessageById(id: string): Promise<ChatMessage | null> {
    const response = await this.dispatch({
      type: "get_chat_message_by_id",
      payload: { id },
    });

    if (response.type !== "get_chat_message_by_id_result") {
      throw new Error(
        `Unexpected response type for getChatMessageById: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async listChatMessages(): Promise<ChatMessage[]> {
    const response = await this.dispatch({ type: "list_chat_messages" });

    if (response.type !== "list_chat_messages_result") {
      throw new Error(
        `Unexpected response type for listChatMessages: ${response.type}`,
      );
    }

    return response.payload;
  }

  private async dispatch(request: DbWorkerRequest): Promise<DbWorkerResponse> {
    const response = await this.endpoint.post(request);

    if (response.type === "error") {
      throw new Error(`[${response.payload.code}] ${response.payload.message}`);
    }

    return response;
  }
}

export function createInProcessDbWorkerEndpoint(
  endpoint: DbWorkerEndpoint,
): DbWorkerEndpoint {
  return {
    post(request) {
      return endpoint.post(request);
    },
  };
}
