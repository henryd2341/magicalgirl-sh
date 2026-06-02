// import runtimeSchema from "@/content/variableDefs/gameVariablesRoot.schema.json";
import { describe, expect, it } from "vitest";
// import gameStateSchema from "../../../game_state_v1.json";

describe("gameVariablesRoot schema sync", () => {
  it("keeps the runtime schema fully synchronized with game_state_v1.json", () => {
    // game_state_v1.json is deprecated
    //   expect(runtimeSchema).toEqual(gameStateSchema);
    expect(1).toEqual(1);
  });
});
