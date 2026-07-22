import ApiSettingsView from "@/pages/ApiSettingsView.vue";
import { fireEvent, render, screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vue-router", () => ({
  useRouter: () => ({}),
}));

describe("API settings provider controls", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it("shows native provider choices and provider-specific controls", async () => {
    render(ApiSettingsView);

    await fireEvent.click(
      await screen.findByRole("button", { name: "新增 Profile" }),
    );

    const kindSelect = screen.getByLabelText("Provider 类型");
    expect(screen.getByRole("option", { name: "OpenAI Responses" }))
      .toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Anthropic" }))
      .toBeInTheDocument();

    await fireEvent.update(kindSelect, "openai-responses");
    expect(screen.getByLabelText("Reasoning Effort")).toBeInTheDocument();
    expect(screen.queryByLabelText("深度思考 (Thinking)"))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("显示思维链")).toBeInTheDocument();
    expect(screen.getByLabelText("Base URL")).toHaveAttribute(
      "placeholder",
      "官方默认：https://api.openai.com/v1",
    );

    await fireEvent.update(kindSelect, "anthropic");
    expect(screen.queryByLabelText("Reasoning Effort")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("深度思考 (Thinking)"))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("显示思维链")).toBeInTheDocument();
    expect(screen.getByLabelText("Base URL")).toHaveAttribute(
      "placeholder",
      "官方默认：https://api.anthropic.com/v1",
    );
  });
});
