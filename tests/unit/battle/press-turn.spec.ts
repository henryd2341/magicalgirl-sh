import {
  allocatePressTurnIcons,
  consumeAllIcons,
  consumeOneIcon,
  consumeTwoIcons,
  createPressTurnStateForSide,
  getActingParticipantIdsForSide,
  isPressTurnExhausted,
  rewardOneHalfTurn,
  settlePassPressTurn,
  settlePressTurnByOutcome,
  settlePressTurnResultByOutcome,
} from "@/engine/battle/pressTurn";
import type { BattleParticipant } from "@/types/battle";
import { describe, expect, it } from "vitest";

describe("pressTurn", () => {
  it("allocates one solid press turn icon for each acting participant on the owner side", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2"]);

    expect(state.ownerSide).toBe("player");
    expect(state.icons).toHaveLength(2);
    expect(state.icons).toEqual([
      expect.objectContaining({ state: "solid" }),
      expect.objectContaining({ state: "solid" }),
    ]);
  });

  it("allocates icons only for participants on the owner side who are active, not down, and can act", () => {
    const participants: BattleParticipant[] = [
      {
        id: "player-1",
        side: "player",
        displayName: "player-1",
        hp: { current: 100, max: 100 },
        mp: { current: 10, max: 10 },
        isDown: false,
        isActive: true,
        canAct: true,
      },
      {
        id: "player-2",
        side: "player",
        displayName: "player-2",
        hp: { current: 100, max: 100 },
        mp: { current: 10, max: 10 },
        isDown: false,
        isActive: true,
        canAct: false,
      },
      {
        id: "player-3",
        side: "player",
        displayName: "player-3",
        hp: { current: 0, max: 100 },
        mp: { current: 10, max: 10 },
        isDown: true,
        isActive: true,
        canAct: true,
      },
      {
        id: "player-4",
        side: "player",
        displayName: "player-4",
        hp: { current: 100, max: 100 },
        mp: { current: 10, max: 10 },
        isDown: false,
        isActive: false,
        canAct: true,
      },
      {
        id: "enemy-1",
        side: "enemy",
        displayName: "enemy-1",
        hp: { current: 100, max: 100 },
        mp: { current: 10, max: 10 },
        isDown: false,
        isActive: true,
        canAct: true,
      },
    ];

    expect(getActingParticipantIdsForSide(participants, "player")).toEqual([
      "player-1",
    ]);
    expect(
      createPressTurnStateForSide(participants, "player").icons,
    ).toHaveLength(1);
  });

  it("consumes one icon on a normal hit", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2"]);

    expect(consumeOneIcon(state).icons).toHaveLength(1);
  });

  it("consumes two icons on miss and block", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2", "p3"]);

    expect(consumeTwoIcons(state).icons).toHaveLength(1);
    expect(settlePressTurnByOutcome(state, "miss").icons).toHaveLength(1);
    expect(settlePressTurnByOutcome(state, "block").icons).toHaveLength(1);
  });

  it("consumes all icons on reflect and absorb", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2", "p3"]);

    expect(consumeAllIcons(state).icons).toHaveLength(0);
    expect(settlePressTurnByOutcome(state, "reflect").icons).toHaveLength(0);
    expect(settlePressTurnByOutcome(state, "absorb").icons).toHaveLength(0);
  });

  it("converts one existing solid icon into blinking on half-turn reward cases", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2"]);

    expect(rewardOneHalfTurn(state).icons).toEqual([
      expect.objectContaining({ state: "solid" }),
      expect.objectContaining({ state: "blinking" }),
    ]);
    expect(settlePressTurnByOutcome(state, "hit", ["weak"]).icons).toEqual([
      expect.objectContaining({ state: "solid" }),
      expect.objectContaining({ state: "blinking" }),
    ]);
    expect(settlePressTurnByOutcome(state, "hit", ["critical"]).icons).toEqual([
      expect.objectContaining({ state: "solid" }),
      expect.objectContaining({ state: "blinking" }),
    ]);
  });

  it("falls back to consuming one icon when rewarding a half turn but no solid icon exists", () => {
    const blinkingOnlyState = {
      ownerSide: "player" as const,
      icons: [{ id: "pt-1", state: "blinking" as const }],
    };

    expect(rewardOneHalfTurn(blinkingOnlyState).icons).toEqual([]);
  });

  it("keeps icons unchanged on status_no_effect", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2"]);

    expect(settlePressTurnByOutcome(state, "status_no_effect")).toEqual(state);
  });

  it("returns settlement result metadata for normal hits", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2"]);

    expect(settlePressTurnResultByOutcome(state, "hit")).toEqual({
      kind: "consume_one",
      reason: "hit",
      before: state,
      after: {
        ownerSide: "player",
        icons: [expect.objectContaining({ state: "solid" })],
      },
    });
  });

  it("returns settlement result metadata for weak and critical rewards", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2"]);

    expect(settlePressTurnResultByOutcome(state, "hit", ["weak"])).toEqual({
      kind: "reward_half_turn",
      reason: "weak",
      before: state,
      after: {
        ownerSide: "player",
        icons: [
          expect.objectContaining({ state: "solid" }),
          expect.objectContaining({ state: "blinking" }),
        ],
      },
    });

    expect(settlePressTurnResultByOutcome(state, "hit", ["critical"])).toEqual({
      kind: "reward_half_turn",
      reason: "critical",
      before: state,
      after: {
        ownerSide: "player",
        icons: [
          expect.objectContaining({ state: "solid" }),
          expect.objectContaining({ state: "blinking" }),
        ],
      },
    });
  });

  it("returns settlement result metadata for miss, block, reflect, absorb, and status_no_effect", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2", "p3"]);

    expect(settlePressTurnResultByOutcome(state, "miss").kind).toBe(
      "consume_two",
    );
    expect(settlePressTurnResultByOutcome(state, "miss").reason).toBe("miss");

    expect(settlePressTurnResultByOutcome(state, "block").kind).toBe(
      "consume_two",
    );
    expect(settlePressTurnResultByOutcome(state, "block").reason).toBe("block");

    expect(settlePressTurnResultByOutcome(state, "reflect").kind).toBe(
      "consume_all",
    );
    expect(settlePressTurnResultByOutcome(state, "reflect").reason).toBe(
      "reflect",
    );

    expect(settlePressTurnResultByOutcome(state, "absorb").kind).toBe(
      "consume_all",
    );
    expect(settlePressTurnResultByOutcome(state, "absorb").reason).toBe(
      "absorb",
    );

    expect(settlePressTurnResultByOutcome(state, "status_no_effect")).toEqual({
      kind: "no_change",
      reason: "status_no_effect",
      before: state,
      after: state,
    });
  });

  it("uses pass-specific settlement: convert solid to blinking when possible", () => {
    const state = allocatePressTurnIcons("player", ["p1", "p2"]);

    expect(settlePassPressTurn(state)).toEqual({
      kind: "reward_half_turn",
      reason: "pass",
      before: state,
      after: {
        ownerSide: "player",
        icons: [
          expect.objectContaining({ state: "solid" }),
          expect.objectContaining({ state: "blinking" }),
        ],
      },
    });
  });

  it("uses pass-specific settlement: consume one icon when only blinking icons remain", () => {
    const state = {
      ownerSide: "player" as const,
      icons: [{ id: "pt-1", state: "blinking" as const }],
    };

    expect(settlePassPressTurn(state)).toEqual({
      kind: "consume_one",
      reason: "pass",
      before: state,
      after: {
        ownerSide: "player",
        icons: [],
      },
    });
  });

  it("reports exhaustion when no icons remain", () => {
    expect(isPressTurnExhausted({ ownerSide: "player", icons: [] })).toBe(true);
    expect(
      isPressTurnExhausted({
        ownerSide: "player",
        icons: [{ id: "pt-1", state: "solid" }],
      }),
    ).toBe(false);
  });
});
