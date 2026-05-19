export const PIPELINE_STATES = [
  "PROMPT_BUILDING",
  "STREAMING_TEXT",
  "VALIDATING_TOOLS",
  "EXECUTING_COMMANDS",
  "PERSISTING_CHECKPOINT",
  "ROLLING_BACK",
] as const;

export type PipelineState = (typeof PIPELINE_STATES)[number];
