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
});
