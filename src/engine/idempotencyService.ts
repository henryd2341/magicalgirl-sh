/* eslint-disable no-unused-vars */
export interface ToolCallExecutionRecord {
  toolCallId: string;
  requestId: string;
  toolName: string;
  recordedAt: string;
}

export interface ToolCallExecutionLedger {
  hasSucceeded(toolCallId: string): Promise<boolean>;
  recordSuccess(record: ToolCallExecutionRecord): Promise<void>;
}

export class InMemoryToolCallExecutionLedger implements ToolCallExecutionLedger {
  private readonly records = new Map<string, ToolCallExecutionRecord>();

  public hasSucceeded(toolCallId: string): Promise<boolean> {
    return Promise.resolve(this.records.has(toolCallId));
  }

  public recordSuccess(record: ToolCallExecutionRecord): Promise<void> {
    this.records.set(record.toolCallId, record);
    return Promise.resolve();
  }

  public list(): Promise<ToolCallExecutionRecord[]> {
    return Promise.resolve(Array.from(this.records.values()));
  }
}
