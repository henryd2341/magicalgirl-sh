import GameConversationPanel from "@/ui/game/GameConversationPanel.vue";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GameConversationPanel recovery actions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("rolls back to the latest idle checkpoint from a failed draft action", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const chatStore = useChatStore();
    const sessionStore = useSessionStore();
    const rollbackSpy = vi
      .spyOn(sessionStore, "rollbackToLatestIdleCheckpoint")
      .mockResolvedValue({
        ok: true,
        checkpointId: "checkpoint-idle-ui",
      });
    const refreshSpy = vi
      .spyOn(chatStore, "refreshMessages")
      .mockResolvedValue();

    chatStore.messages = [
      {
        id: "assistant-failed-ui",
        role: "assistant",
        kind: "failed_draft",
        content: "这段生成失败，需要恢复。",
        user_visible: true,
        ai_visible: true,
        provisional: false,
        finalized: false,
        failed: true,
        request_id: "req-failed-ui",
        created_at: "2026-05-25T09:00:00.000Z",
      },
    ];

    render(GameConversationPanel, {
      global: {
        plugins: [pinia],
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "回滚到最近检查点" }),
    );

    await waitFor(() => {
      expect(rollbackSpy).toHaveBeenCalledTimes(1);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText("已回滚到 checkpoint-idle-ui。"),
      ).toBeInTheDocument();
    });
  });
});
