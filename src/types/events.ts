import type { PipelineState } from "@/types/pipeline";
import type { SessionState } from "@/types/session";

export interface SessionStateChangedEvent {
  type: "SessionStateChanged";
  previousSessionState: SessionState;
  nextSessionState: SessionState;
  previousPipelineState: PipelineState | null;
  nextPipelineState: PipelineState | null;
  activeRequestId: string | null;
}
