import type { TriggerBattleCommandPayload } from "@/orchestrator/toolEnvelope";
import type { PipelineState } from "@/types/pipeline";
import type { VariablePatchEnvelope } from "@/types/variables";

export type DomainCommand =
  | {
      type: "BEGIN_AI_REQUEST";
      requestId: string;
      pipelineState: PipelineState;
    }
  | {
      type: "ADVANCE_PIPELINE";
      pipelineState: PipelineState;
    }
  | {
      type: "COMPLETE_AI_REQUEST";
    }
  | {
      type: "ENTER_COMBAT_PENDING";
    }
  | {
      type: "ENTER_COMBAT";
    }
  | {
      type: "MARK_POST_COMBAT_READY";
    }
  | {
      type: "ENTER_ERROR_RECOVERY";
    }
  | {
      type: "RESET_TO_IDLE";
    }
  | {
      type: "APPLY_VARIABLE_PATCH";
      envelope: VariablePatchEnvelope;
    }
  | {
      type: "TRIGGER_BATTLE";
      payload: TriggerBattleCommandPayload;
    };
