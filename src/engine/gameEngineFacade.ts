import { CommandBus } from "@/engine/commandBus";
import type { SessionManager, SessionSnapshot } from "@/engine/sessionManager";
import type { DomainCommand } from "@/types/commands";
import type { PipelineState } from "@/types/pipeline";

export class GameEngineFacade {
  private readonly commandBus: CommandBus;
  private readonly sessionManager: SessionManager;

  public constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
    this.commandBus = new CommandBus((command) => {
      this.handle(command);
    });
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
    }
  }
}
