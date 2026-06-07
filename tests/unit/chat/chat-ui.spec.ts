/* eslint-disable no-undef */

import ChatInputBox from "@/ui/chat/ChatInputBox.vue";
import ChatMessageList from "@/ui/chat/ChatMessageList.vue";
import FailedDraftActions from "@/ui/chat/FailedDraftActions.vue";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

describe("ChatMessageList", () => {
  it("renders user, provisional assistant, and failed draft messages with semantic status labels", () => {
    render(ChatMessageList, {
      props: {
        messages: [
          {
            id: "user-1",
            role: "user",
            kind: "normal",
            content: "我走向天台边缘。",
            user_visible: true,
            ai_visible: true,
            provisional: false,
            finalized: true,
            failed: false,
            created_at: "2026-05-20T00:00:00.000Z",
          },
          {
            id: "assistant-1",
            role: "assistant",
            kind: "normal",
            content: "风把你的裙摆吹成一面旗。",
            user_visible: true,
            ai_visible: true,
            provisional: true,
            finalized: false,
            failed: false,
            request_id: "req-ui-1",
            created_at: "2026-05-20T00:00:01.000Z",
          },
          {
            id: "assistant-2",
            role: "assistant",
            kind: "failed_draft",
            content: "楼梯间的门后传来杂音。",
            user_visible: true,
            ai_visible: true,
            provisional: false,
            finalized: false,
            failed: true,
            request_id: "req-ui-2",
            created_at: "2026-05-20T00:00:02.000Z",
          },
        ],
      },
    });

    expect(screen.getByRole("region", { name: "消息列表" })).toHaveAttribute(
      "id",
      "chat-message-list",
    );
    expect(screen.getByText("我走向天台边缘。")).toBeInTheDocument();
    expect(screen.getByText("风把你的裙摆吹成一面旗。")).toBeInTheDocument();
    expect(screen.getByText("楼梯间的门后传来杂音。")).toBeInTheDocument();
    expect(screen.getByText("生成中")).toBeInTheDocument();
    expect(screen.getByText("失败草稿")).toBeInTheDocument();
  });
});

describe("FailedDraftActions", () => {
  it("emits retry, edit_retry, and rollback actions for failed drafts", async () => {
    const { emitted } = render(FailedDraftActions, {
      props: {
        messageId: "assistant-failed-ui",
      },
    });

    await screen.getByRole("button", { name: "重试本段" }).click();
    await screen.getByRole("button", { name: "编辑后重试" }).click();
    await screen.getByRole("button", { name: "回滚到最近检查点" }).click();

    expect(emitted()).toMatchObject({
      retry: [["assistant-failed-ui"]],
      edit_retry: [["assistant-failed-ui"]],
      rollback: [["assistant-failed-ui"]],
    });
  });
});

describe("ChatInputBox", () => {
  it("submits trimmed user input and clears the field through internal form controls", async () => {
    const onSubmit = vi.fn();
    render(ChatInputBox, {
      props: {
        disabled: false,
        onSubmitMessage: onSubmit,
      },
    });

    const textbox = screen.getByRole("textbox", { name: "故事输入框" });
    textbox.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "   帮我继续这段对话。  ",
      }),
    );
    (textbox as HTMLTextAreaElement).value = "   帮我继续这段对话。  ";
    textbox.dispatchEvent(new Event("input", { bubbles: true }));

    await screen.getByRole("button", { name: "发送" }).click();

    expect(onSubmit).toHaveBeenCalledWith("帮我继续这段对话。");
    expect((textbox as HTMLTextAreaElement).value).toBe("");
  });
});
