import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { describe, expect, it } from "vitest";

describe("SessionManager FSM", () => {
  it("starts in IDLE and allows a single active request to enter GENERATING", () => {
    const manager = createSessionManager();

    expect(manager.getSnapshot()).toMatchObject({
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    });

    manager.beginRequest({
      requestId: "req-001",
      pipelineState: "PROMPT_BUILDING",
    });

    expect(manager.getSnapshot()).toMatchObject({
      sessionState: "GENERATING",
      pipelineState: "PROMPT_BUILDING",
      activeRequestId: "req-001",
    });
  });

  it("rejects a second AI request while already GENERATING", () => {
    const manager = createSessionManager();

    manager.beginRequest({
      requestId: "req-001",
      pipelineState: "PROMPT_BUILDING",
    });

    expect(() => {
      manager.beginRequest({
        requestId: "req-002",
        pipelineState: "STREAMING_TEXT",
      });
    }).toThrow(
      "[SESSION_INVALID_TRANSITION] Cannot begin a new request while another request is active.",
    );
  });

  it("rejects AI orchestration while the session is IN_COMBAT", () => {
    const manager = createSessionManager();

    manager.enterCombatPending();
    manager.enterCombat();

    expect(manager.getSnapshot().sessionState).toBe("IN_COMBAT");

    expect(() => {
      manager.beginRequest({
        requestId: "req-combat-blocked",
        pipelineState: "PROMPT_BUILDING",
      });
    }).toThrow(
      "[SESSION_INVALID_TRANSITION] Cannot begin AI orchestration while in combat.",
    );
  });

  it("rejects illegal direct transition from IDLE to POST_COMBAT_READY", () => {
    const manager = createSessionManager();

    expect(() => {
      manager.markPostCombatReady();
    }).toThrow(
      "[SESSION_INVALID_TRANSITION] Cannot enter POST_COMBAT_READY from IDLE.",
    );
  });

  it("clears activeRequestId and returns to IDLE when a request completes", () => {
    const manager = createSessionManager();

    manager.beginRequest({
      requestId: "req-complete",
      pipelineState: "PROMPT_BUILDING",
    });
    manager.advancePipeline("STREAMING_TEXT");
    manager.completeRequest();

    expect(manager.getSnapshot()).toMatchObject({
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    });
  });

  it("enters ERROR_RECOVERY from GENERATING while preserving the failed request id", () => {
    const manager = createSessionManager();

    manager.beginRequest({
      requestId: "req-error",
      pipelineState: "EXECUTING_COMMANDS",
    });
    manager.enterErrorRecovery();

    expect(manager.getSnapshot()).toMatchObject({
      sessionState: "ERROR_RECOVERY",
      pipelineState: null,
      activeRequestId: "req-error",
    });
  });

  it("allows resetToIdle after ERROR_RECOVERY and then permits a fresh request", () => {
    const manager = createSessionManager();

    manager.beginRequest({
      requestId: "req-reset-source",
      pipelineState: "VALIDATING_TOOLS",
    });
    manager.enterErrorRecovery();
    manager.resetToIdle();

    manager.beginRequest({
      requestId: "req-after-reset",
      pipelineState: "PROMPT_BUILDING",
    });

    expect(manager.getSnapshot()).toMatchObject({
      sessionState: "GENERATING",
      pipelineState: "PROMPT_BUILDING",
      activeRequestId: "req-after-reset",
    });
  });

  it("allows POST_COMBAT_READY to begin a fresh AI request for post-combat continuation", () => {
    const manager = createSessionManager();

    manager.enterCombatPending();
    manager.enterCombat();
    manager.markPostCombatReady();

    manager.beginRequest({
      requestId: "req-post-combat",
      pipelineState: "PROMPT_BUILDING",
    });

    expect(manager.getSnapshot()).toMatchObject({
      sessionState: "GENERATING",
      pipelineState: "PROMPT_BUILDING",
      activeRequestId: "req-post-combat",
    });
  });

  it("rejects pipeline advancement when the session is not GENERATING", () => {
    const manager = createSessionManager();

    expect(() => {
      manager.advancePipeline("STREAMING_TEXT");
    }).toThrow(
      "[SESSION_INVALID_TRANSITION] Cannot advance pipeline while session is IDLE.",
    );
  });
});

describe("GameEngineFacade", () => {
  it("exposes a unified request entrypoint backed by the session manager", () => {
    const facade = new GameEngineFacade(createSessionManager());

    facade.beginAiRequest("req-100");

    expect(facade.getSessionSnapshot()).toMatchObject({
      sessionState: "GENERATING",
      pipelineState: "PROMPT_BUILDING",
      activeRequestId: "req-100",
    });
  });

  it("supports advancing pipeline, entering recovery, resetting, and completing through facade commands", () => {
    const facade = new GameEngineFacade(createSessionManager());

    facade.beginAiRequest("req-200");
    facade.advancePipeline("STREAMING_TEXT");

    expect(facade.getSessionSnapshot()).toMatchObject({
      sessionState: "GENERATING",
      pipelineState: "STREAMING_TEXT",
      activeRequestId: "req-200",
    });

    facade.enterErrorRecovery();
    expect(facade.getSessionSnapshot()).toMatchObject({
      sessionState: "ERROR_RECOVERY",
      pipelineState: null,
      activeRequestId: "req-200",
    });

    facade.resetToIdle();
    facade.beginAiRequest("req-201");
    facade.completeAiRequest();

    expect(facade.getSessionSnapshot()).toMatchObject({
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    });
  });
});
