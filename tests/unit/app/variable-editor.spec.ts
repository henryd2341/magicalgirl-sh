import VariableEditor from "@/ui/dev/VariableEditor.vue";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

const { getVariableSnapshot, patchVariables } = vi.hoisted(() => ({
  getVariableSnapshot: vi.fn(),
  patchVariables: vi.fn(),
}));

vi.mock("@/stores/sessionStore", () => ({
  useSessionStore: () => ({
    getVariableSnapshot,
    patchVariables,
  }),
}));

describe("VariableEditor", () => {
  it("toggles a boolean from its current value and persists the changed boolean", async () => {
    getVariableSnapshot.mockResolvedValue({
      stateHash: "1234567890abcdef",
      version: 1,
      root: {
        world: {
          flags: {
            testFlag: false,
          },
        },
      },
    });
    patchVariables.mockResolvedValue(undefined);

    render(VariableEditor);

    const key = await screen.findByText("testFlag");
    const row = key.closest(".mg-ve__node");
    expect(row).not.toBeNull();
    await fireEvent.click(within(row as HTMLElement).getByText("false"));

    const checkbox = within(row as HTMLElement).getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await fireEvent.click(checkbox);

    await waitFor(() => {
      expect(patchVariables).toHaveBeenCalledWith(
        [{ path: "world.flags.testFlag", value: true }],
        "variable-editor",
      );
    });
  });
});