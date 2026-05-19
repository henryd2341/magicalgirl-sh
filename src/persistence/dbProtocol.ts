/* eslint-disable no-unused-vars */

import type { ChatMessage } from "@/types/chat";

export interface TestRecordRow {
  id: string;
  label: string;
  createdAt: string;
}

export interface DbInitResult {
  ready: true;
  schemaVersion: number;
  availableTables: string[];
  appliedMigrations: string[];
}

export interface DbWorkerErrorPayload {
  code: "DB_WORKER_NOT_READY" | "DB_WORKER_UNKNOWN_REQUEST";
  message: string;
}

export interface DbWorkerStateSnapshot {
  migrations: Set<string>;
  tables: Set<string>;
  initialized: boolean;
  testRecords: Map<string, TestRecordRow>;
  chatHistory: Map<string, ChatMessage>;
}

export type DbWorkerRequest =
  | {
      type: "initialize";
    }
  | {
      type: "insert_test_record";
      payload: TestRecordRow;
    }
  | {
      type: "list_test_records";
    }
  | {
      type: "save_chat_message";
      payload: ChatMessage;
    }
  | {
      type: "get_chat_message_by_id";
      payload: {
        id: string;
      };
    }
  | {
      type: "list_chat_messages";
    };

export type DbWorkerSuccessResponse =
  | {
      type: "initialize_result";
      payload: DbInitResult;
    }
  | {
      type: "insert_test_record_result";
      payload: {
        insertedId: string;
      };
    }
  | {
      type: "list_test_records_result";
      payload: TestRecordRow[];
    }
  | {
      type: "save_chat_message_result";
      payload: {
        savedId: string;
      };
    }
  | {
      type: "get_chat_message_by_id_result";
      payload: ChatMessage | null;
    }
  | {
      type: "list_chat_messages_result";
      payload: ChatMessage[];
    };

export type DbWorkerErrorResponse = {
  type: "error";
  payload: DbWorkerErrorPayload;
};

export type DbWorkerResponse = DbWorkerSuccessResponse | DbWorkerErrorResponse;

export interface DbWorkerEndpoint {
  post: (request: DbWorkerRequest) => Promise<DbWorkerResponse>;
}
