export const SESSION_STATES = [
  "IDLE",
  "GENERATING",
  "COMBAT_PENDING",
  "IN_COMBAT",
  "POST_COMBAT_READY",
  "ERROR_RECOVERY",
] as const;

export type SessionState = (typeof SESSION_STATES)[number];
