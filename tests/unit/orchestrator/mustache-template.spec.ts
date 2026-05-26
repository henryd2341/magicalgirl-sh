import { VariableEngine } from "@/engine/variableEngine";
import { renderMustacheTemplate } from "@/orchestrator/mustacheTemplate";
import { describe, expect, it } from "vitest";

describe("renderMustacheTemplate", () => {
  it("renders aliases, variable paths, overrides, defaults, and unresolved tokens with trace data", () => {
    const variableState = new VariableEngine().createInitialState();
    variableState.root.player.profile.name = "小圆";
    variableState.root.world.location.name = "弓川市";

    const result = renderMustacheTemplate(
      [
        "alias={{user}}",
        "path={{world.location.name}}",
        "override={{nickname}}",
        "pipe={{missing.pipe|default=鹿目真昼}}",
        "coalesce={{missing.name ?? 鹿目真昼}}",
        "missing={{missing.value}}",
      ].join("\n"),
      variableState,
      {
        nickname: "雷伊",
      },
    );

    expect(result.text).toContain("alias=小圆");
    expect(result.text).toContain("path=弓川市");
    expect(result.text).toContain("override=雷伊");
    expect(result.text).toContain("pipe=鹿目真昼");
    expect(result.text).toContain("coalesce=鹿目真昼");
    expect(result.text).toContain("missing={{missing.value}}");
    expect(result.resolutions).toEqual([
      expect.objectContaining({
        token: "{{user}}",
        key: "user",
        resolvedPath: "player.profile.name",
        status: "resolved",
        value: "小圆",
      }),
      expect.objectContaining({
        token: "{{world.location.name}}",
        status: "resolved",
        value: "弓川市",
      }),
      expect.objectContaining({
        token: "{{nickname}}",
        status: "resolved",
        value: "雷伊",
      }),
      expect.objectContaining({
        token: "{{missing.pipe|default=鹿目真昼}}",
        status: "defaulted",
        value: "鹿目真昼",
      }),
      expect.objectContaining({
        token: "{{missing.name ?? 鹿目真昼}}",
        status: "defaulted",
        value: "鹿目真昼",
      }),
      expect.objectContaining({
        token: "{{missing.value}}",
        status: "unresolved",
        value: null,
      }),
    ]);
  });
});
