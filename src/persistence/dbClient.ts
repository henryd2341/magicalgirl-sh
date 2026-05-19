import type {
  DbInitResult,
  DbWorkerEndpoint,
  DbWorkerRequest,
  DbWorkerResponse,
  TestRecordRow,
} from "@/persistence/dbProtocol";

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
