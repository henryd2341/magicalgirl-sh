import { VariableEngine } from "@/engine/variableEngine";
import type {
  VariableChangeLogRepository,
  VariableRepository,
} from "@/persistence/repositories/variableRepository";
import type {
  VariableChangeLogRecord,
  VariablePatchEnvelope,
  VariablePatchResult,
} from "@/types/variables";

export interface VariablePatchCommitResult extends VariablePatchResult {
  committed: true;
}

export class VariablePatchService {
  private readonly variableRepository: VariableRepository;

  private readonly changeLogRepository: VariableChangeLogRepository;

  private readonly engine: VariableEngine;

  public constructor(
    variableRepository: VariableRepository,
    changeLogRepository: VariableChangeLogRepository,
    engine: VariableEngine = new VariableEngine(),
  ) {
    this.variableRepository = variableRepository;
    this.changeLogRepository = changeLogRepository;
    this.engine = engine;
  }

  public async applyPatchEnvelope(
    envelope: VariablePatchEnvelope,
  ): Promise<VariablePatchCommitResult> {
    const current =
      (await this.variableRepository.getCurrent()) ??
      this.engine.createInitialState();

    const result = this.engine.applyPatchSet({
      current,
      envelope,
    });

    await this.variableRepository.saveCurrent(result.next);

    const changeLog: VariableChangeLogRecord = {
      id: `${envelope.request_id}:${envelope.tool_call_id}`,
      rootId: current.rootId,
      requestId: envelope.request_id,
      toolCallId: envelope.tool_call_id,
      contextVersion: envelope.context_version,
      stateHashBefore: current.stateHash,
      stateHashAfter: result.nextHash,
      patches: envelope.patches,
      createdAt: result.next.updatedAt,
    };

    await this.changeLogRepository.append(changeLog);

    return {
      committed: true,
      next: result.next,
      nextHash: result.nextHash,
    };
  }

  public async getCurrentStateHash(): Promise<string> {
    const current =
      (await this.variableRepository.getCurrent()) ??
      this.engine.createInitialState();

    return current.stateHash;
  }
}
