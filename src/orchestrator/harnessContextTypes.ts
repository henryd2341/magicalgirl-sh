import type { ToolEnvelopeCandidate } from "@/orchestrator/toolEnvelope";
import type { ChatMessageRole } from "@/types/chat";

export type PromptSegmentKind =
  | "system"
  | "skills"
  | "world_info"
  | "state"
  | "tools"
  | "history"
  | "summary";

export interface PromptSegment {
  id: string;
  kind: PromptSegmentKind;
  title: string;
  content: string;
  source: string;
  tokenEstimate: number;
  included: boolean;
  droppedReason?: string;
}

export interface ContextBudget {
  maxTotalTokens: number;
}

export interface ContextInjectionTrace {
  sourceId: string;
  kind: PromptSegmentKind;
  included: boolean;
  reason: string;
  priority?: number;
  tokenEstimate?: number;
}

export interface HarnessRequestMetadata {
  request_id: string;
  context_version: number;
  state_hash: string;
  issued_at: string;
}

export interface ProviderMessage {
  role: ChatMessageRole;
  content: string;
}

export interface ProviderToolDefinition {
  name: "update_variables" | "trigger_battle" | "read_skill";
  description: string;
}

export interface BuiltProviderRequest {
  metadata: HarnessRequestMetadata;
  segments: PromptSegment[];
  traces: ContextInjectionTrace[];
  messages: ProviderMessage[];
  tools: ProviderToolDefinition[];
  promptText: string;
}

export interface ProviderToolCallCandidate {
  tool_name: ToolEnvelopeCandidate["tool_name"];
  tool_call_id: string;
  input: unknown;
}
