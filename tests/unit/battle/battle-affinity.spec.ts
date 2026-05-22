import {
  hasElement,
  resolveAffinityResult,
} from "@/engine/battle/battleAffinity";
import { BATTLE_ELEMENTS, BattleElement } from "@/types/battle";
import { describe, expect, it } from "vitest";

describe("battleAffinity", () => {
  it("detects whether an element exists in an affinity mask", () => {
    const mask: BattleElement = BATTLE_ELEMENTS.Fire | BATTLE_ELEMENTS.Earth;

    expect(hasElement(mask, BATTLE_ELEMENTS.Fire)).toBe(true);
    expect(hasElement(mask, BATTLE_ELEMENTS.Earth)).toBe(true);
    expect(hasElement(mask, BATTLE_ELEMENTS.Ice)).toBe(false);
  });

  it("resolves absorb before reflect before nullify before weak before resist", () => {
    const element = BATTLE_ELEMENTS.Fire;

    expect(
      resolveAffinityResult(
        {
          weak: element,
          resist: element,
          nullify: element,
          reflect: element,
          absorb: element,
        },
        element,
      ),
    ).toBe("absorb");

    expect(
      resolveAffinityResult(
        {
          weak: element,
          resist: element,
          nullify: element,
          reflect: element,
          absorb: 0,
        },
        element,
      ),
    ).toBe("reflect");

    expect(
      resolveAffinityResult(
        {
          weak: element,
          resist: element,
          nullify: element,
          reflect: 0,
          absorb: 0,
        },
        element,
      ),
    ).toBe("nullify");

    expect(
      resolveAffinityResult(
        {
          weak: element,
          resist: element,
          nullify: 0,
          reflect: 0,
          absorb: 0,
        },
        element,
      ),
    ).toBe("weak");

    expect(
      resolveAffinityResult(
        {
          weak: 0,
          resist: element,
          nullify: 0,
          reflect: 0,
          absorb: 0,
        },
        element,
      ),
    ).toBe("resist");

    expect(
      resolveAffinityResult(
        {
          weak: 0,
          resist: 0,
          nullify: 0,
          reflect: 0,
          absorb: 0,
        },
        element,
      ),
    ).toBe("normal");
  });
});
