/* eslint-disable no-unused-vars */

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
    };

export type DbWorkerErrorResponse = {
  type: "error";
  payload: DbWorkerErrorPayload;
};

export type DbWorkerResponse = DbWorkerSuccessResponse | DbWorkerErrorResponse;

export interface DbWorkerEndpoint {
  post: (request: DbWorkerRequest) => Promise<DbWorkerResponse>;
}
