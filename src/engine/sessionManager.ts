/* eslint-disable no-unused-vars */

import type { PipelineState } from "@/types/pipeline";
import { SESSION_STATES, type SessionState } from "@/types/session";

export interface SessionSnapshot {
  sessionState: SessionState;
  pipelineState: PipelineState | null;
  activeRequestId: string | null;
}

export interface BeginRequestInput {
  requestId: string;
  pipelineState: PipelineState;
}

export interface SessionManager {
  getSnapshot(): SessionSnapshot;
  beginRequest(input: BeginRequestInput): void;
  advancePipeline(pipelineState: PipelineState): void;
  completeRequest(): void;
  enterCombatPending(): void;
  enterCombat(): void;
  markPostCombatReady(): void;
  enterErrorRecovery(): void;
  resetToIdle(): void;
  restoreSnapshot(snapshot: SessionSnapshot): void;
}

const INITIAL_SNAPSHOT: SessionSnapshot = {
  sessionState: "IDLE",
  pipelineState: null,
  activeRequestId: null,
};

function createInvalidTransitionError(message: string): Error {
  return new Error(`[SESSION_INVALID_TRANSITION] ${message}`);
}

export function createSessionManager(): SessionManager {
  let snapshot: SessionSnapshot = { ...INITIAL_SNAPSHOT };

  return {
    getSnapshot() {
      return { ...snapshot };
    },
    beginRequest(input) {
      if (snapshot.activeRequestId !== null) {
        throw createInvalidTransitionError(
          "Cannot begin a new request while another request is active.",
        );
      }

      if (snapshot.sessionState === "IN_COMBAT") {
        throw createInvalidTransitionError(
          "Cannot begin AI orchestration while in combat.",
        );
      }

      if (
        snapshot.sessionState !== "IDLE" &&
        snapshot.sessionState !== "POST_COMBAT_READY"
      ) {
        throw createInvalidTransitionError(
          `Cannot begin request from ${snapshot.sessionState}.`,
        );
      }

      snapshot = {
        sessionState: "GENERATING",
        pipelineState: input.pipelineState,
        activeRequestId: input.requestId,
      };
    },
    advancePipeline(pipelineState) {
      if (snapshot.sessionState !== "GENERATING") {
        throw createInvalidTransitionError(
          `Cannot advance pipeline while session is ${snapshot.sessionState}.`,
        );
      }

      snapshot = {
        ...snapshot,
        pipelineState,
      };
    },
    completeRequest() {
      if (snapshot.sessionState !== "GENERATING") {
        throw createInvalidTransitionError(
          `Cannot complete request while session is ${snapshot.sessionState}.`,
        );
      }

      snapshot = {
        sessionState: "IDLE",
        pipelineState: null,
        activeRequestId: null,
      };
    },
    enterCombatPending() {
      if (
        snapshot.sessionState !== "IDLE" &&
        snapshot.sessionState !== "GENERATING"
      ) {
        throw createInvalidTransitionError(
          `Cannot enter COMBAT_PENDING from ${snapshot.sessionState}.`,
        );
      }

      snapshot = {
        sessionState: "COMBAT_PENDING",
        pipelineState: null,
        activeRequestId: null,
      };
    },
    enterCombat() {
      if (snapshot.sessionState !== "COMBAT_PENDING") {
        throw createInvalidTransitionError(
          `Cannot enter IN_COMBAT from ${snapshot.sessionState}.`,
        );
      }

      snapshot = {
        sessionState: "IN_COMBAT",
        pipelineState: null,
        activeRequestId: null,
      };
    },
    markPostCombatReady() {
      if (snapshot.sessionState !== "IN_COMBAT") {
        throw createInvalidTransitionError(
          `Cannot enter POST_COMBAT_READY from ${snapshot.sessionState}.`,
        );
      }

      snapshot = {
        sessionState: "POST_COMBAT_READY",
        pipelineState: null,
        activeRequestId: null,
      };
    },
    enterErrorRecovery() {
      snapshot = {
        sessionState: "ERROR_RECOVERY",
        pipelineState: null,
        activeRequestId: snapshot.activeRequestId,
      };
    },
    resetToIdle() {
      snapshot = { ...INITIAL_SNAPSHOT };
    },
    restoreSnapshot(nextSnapshot) {
      if (!SESSION_STATES.includes(nextSnapshot.sessionState)) {
        throw createInvalidTransitionError(
          `Cannot restore unknown session state ${String(nextSnapshot.sessionState)}.`,
        );
      }

      snapshot = { ...nextSnapshot };
    },
  };
}
