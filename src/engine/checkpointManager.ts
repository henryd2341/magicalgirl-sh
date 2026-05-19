export interface CheckpointManager {
  markIdleCheckpoint(): void;
}

export function createCheckpointManager(): CheckpointManager {
  return {
    markIdleCheckpoint() {
      // Module C only establishes the orchestration boundary.
    },
  };
}
