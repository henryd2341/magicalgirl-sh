import { DbWorkerClient } from "@/persistence/dbClient";
import type { TestRecordRow } from "@/persistence/dbProtocol";

export class TestRecordRepository {
  private readonly dbClient: DbWorkerClient;

  public constructor(dbClient: DbWorkerClient) {
    this.dbClient = dbClient;
  }

  public insert(record: TestRecordRow): Promise<void> {
    return this.dbClient.insertTestRecord(record);
  }

  public list(): Promise<TestRecordRow[]> {
    return this.dbClient.listTestRecords();
  }
}
