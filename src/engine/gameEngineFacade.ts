import { CommandBus } from "@/engine/commandBus";
import type { SessionManager, SessionSnapshot } from "@/engine/sessionManager";
import { VariablePatchService } from "@/engine/variablePatchService";
import type {
  TriggerBattleCommandPayload,
  TriggerBattleCommandResult,
} from "@/orchestrator/toolEnvelope";
import {
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
  type VariableChangeLogRepository,
  type VariableRepository,
} from "@/persistence/repositories/variableRepository";
import type { DomainCommand } from "@/types/commands";
import type { PipelineState } from "@/types/pipeline";
import type {
  VariablePatchEnvelope,
  VariablePatchResult,
} from "@/types/variables";

interface ApplyVariablePatchCommand {
  type: "APPLY_VARIABLE_PATCH";
  envelope: VariablePatchEnvelope;
}

interface TriggerBattleCommand {
  type: "TRIGGER_BATTLE";
  payload: TriggerBattleCommandPayload;
}

export interface GameEngineFacadeDependencies {
  variableRepository?: VariableRepository;
  variableChangeLogRepository?: VariableChangeLogRepository;
  variablePatchService?: VariablePatchService;
}

export interface VariablePatchCommitResult extends VariablePatchResult {
  committed: true;
}

export class GameEngineFacade {
  private readonly commandBus: CommandBus;

  private readonly sessionManager: SessionManager;

  private readonly variablePatchService: VariablePatchService;

  public constructor(
    sessionManager: SessionManager,
    dependencies: GameEngineFacadeDependencies = {},
  ) {
    this.sessionManager = sessionManager;
    this.commandBus = new CommandBus((command) => {
      this.handle(command);
    });

    const variableRepository =
      dependencies.variableRepository ?? new InMemoryVariableRepository();
    const variableChangeLogRepository =
      dependencies.variableChangeLogRepository ??
      new InMemoryVariableChangeLogRepository();

    this.variablePatchService =
      dependencies.variablePatchService ??
      new VariablePatchService(variableRepository, variableChangeLogRepository);
  }

  public beginAiRequest(requestId: string): void {
    this.commandBus.dispatch({
      type: "BEGIN_AI_REQUEST",
      requestId,
      pipelineState: "PROMPT_BUILDING",
    });
  }

  public advancePipeline(pipelineState: PipelineState): void {
    this.commandBus.dispatch({
      type: "ADVANCE_PIPELINE",
      pipelineState,
    });
  }

  public completeAiRequest(): void {
    this.commandBus.dispatch({
      type: "COMPLETE_AI_REQUEST",
    });
  }

  public enterErrorRecovery(): void {
    this.commandBus.dispatch({
      type: "ENTER_ERROR_RECOVERY",
    });
  }

  public resetToIdle(): void {
    this.commandBus.dispatch({
      type: "RESET_TO_IDLE",
    });
  }

  public getSessionSnapshot(): SessionSnapshot {
    return this.sessionManager.getSnapshot();
  }

  public applyVariablePatchEnvelope(
    envelope: VariablePatchEnvelope,
  ): Promise<VariablePatchCommitResult> {
    return this.variablePatchService.applyPatchEnvelope(envelope);
  }

  public dispatchCommand(
    command: ApplyVariablePatchCommand,
  ): Promise<VariablePatchCommitResult>;
  public dispatchCommand(
    command: TriggerBattleCommand,
  ): Promise<TriggerBattleCommandResult>;
  public dispatchCommand(
    command: ApplyVariablePatchCommand | TriggerBattleCommand,
  ): Promise<VariablePatchCommitResult | TriggerBattleCommandResult> {
    if (command.type === "APPLY_VARIABLE_PATCH") {
      return this.handleAsync(command);
    }

    return this.handleAsync(command);
  }

  private handle(command: DomainCommand): void {
    switch (command.type) {
      case "BEGIN_AI_REQUEST":
        this.sessionManager.beginRequest({
          requestId: command.requestId,
          pipelineState: command.pipelineState,
        });
        break;
      case "ADVANCE_PIPELINE":
        this.sessionManager.advancePipeline(command.pipelineState);
        break;
      case "COMPLETE_AI_REQUEST":
        this.sessionManager.completeRequest();
        break;
      case "ENTER_COMBAT_PENDING":
        this.sessionManager.enterCombatPending();
        break;
      case "ENTER_COMBAT":
        this.sessionManager.enterCombat();
        break;
      case "MARK_POST_COMBAT_READY":
        this.sessionManager.markPostCombatReady();
        break;
      case "ENTER_ERROR_RECOVERY":
        this.sessionManager.enterErrorRecovery();
        break;
      case "RESET_TO_IDLE":
        this.sessionManager.resetToIdle();
        break;
      case "APPLY_VARIABLE_PATCH":
        break;
      case "TRIGGER_BATTLE":
        break;
    }
  }

  private handleAsync(
    command: ApplyVariablePatchCommand,
  ): Promise<VariablePatchCommitResult>;
  private handleAsync(
    command: TriggerBattleCommand,
  ): Promise<TriggerBattleCommandResult>;
  private handleAsync(
    command: ApplyVariablePatchCommand | TriggerBattleCommand,
  ): Promise<VariablePatchCommitResult | TriggerBattleCommandResult> {
    if (command.type === "APPLY_VARIABLE_PATCH") {
      return this.variablePatchService.applyPatchEnvelope(command.envelope);
    }

    this.sessionManager.enterCombatPending();
    return Promise.resolve({
      accepted: true,
      battleState: "pending",
      encounterId: command.payload.input.encounter_id,
    });
  }
}
