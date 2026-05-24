import BattleCommandMenu from "@/ui/battle/BattleCommandMenu.vue";
import { fireEvent, render, screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

const rootMenu = [
  {
    id: "attack-action",
    kind: "action" as const,
    actionId: "attack" as const,
    label: "Attack",
    description: "使用基础攻击对单体敌人造成伤害。",
  },
  {
    id: "skill-group",
    kind: "group" as const,
    label: "Skill",
    description: "打开技能列表。",
    children: [
      {
        id: "basic-skill-action",
        kind: "action" as const,
        actionId: "basic-skill" as const,
        label: "Basic Skill",
        description: "施放一个默认的单体技能占位动作。",
      },
    ],
  },
];

describe("BattleCommandMenu", () => {
  it("renders root commands and emits menu selection", async () => {
    const onSelectMenuNode = vi.fn();

    render(BattleCommandMenu, {
      props: {
        actionMenu: rootMenu,
        currentMenuNodeId: null,
        selectedActionId: null,
        isResultPhase: false,
        description: "行动描述框",
        onSelectMenuNode,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Skill" }));

    expect(onSelectMenuNode).toHaveBeenCalledWith("skill-group");
    expect(screen.getByText("行动描述框")).toBeInTheDocument();
  });

  it("renders submenu commands with a root return control", async () => {
    const onReturnRoot = vi.fn();

    render(BattleCommandMenu, {
      props: {
        actionMenu: rootMenu,
        currentMenuNodeId: "skill-group",
        selectedActionId: null,
        isResultPhase: false,
        description: "打开技能列表。",
        onSelectMenuNode: vi.fn(),
        onReturnRoot,
      },
    });

    expect(screen.getByRole("button", { name: "Basic Skill" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "返回根菜单" }));

    expect(onReturnRoot).toHaveBeenCalledOnce();
  });

  it("locks submenu command buttons and return control when commands are disabled", async () => {
    const onSelectMenuNode = vi.fn();
    const onReturnRoot = vi.fn();

    render(BattleCommandMenu, {
      props: {
        actionMenu: rootMenu,
        currentMenuNodeId: "skill-group",
        selectedActionId: null,
        isResultPhase: false,
        isLocked: true,
        description: "敌方行动中。",
        onSelectMenuNode,
        onReturnRoot,
      },
    });

    const basicSkillButton = screen.getByRole("button", {
      name: "Basic Skill",
    });
    const returnButton = screen.getByRole("button", { name: "返回根菜单" });

    expect(basicSkillButton).toBeDisabled();
    expect(returnButton).toBeDisabled();

    await fireEvent.click(basicSkillButton);
    await fireEvent.click(returnButton);

    expect(onSelectMenuNode).not.toHaveBeenCalled();
    expect(onReturnRoot).not.toHaveBeenCalled();
  });

  it("renders only the battle completion action during result phase", () => {
    render(BattleCommandMenu, {
      props: {
        actionMenu: rootMenu,
        currentMenuNodeId: null,
        selectedActionId: "attack",
        isResultPhase: true,
        description: "Victory",
        onSelectMenuNode: vi.fn(),
        onCompleteBattle: vi.fn(),
      },
    });

    expect(screen.getByRole("button", { name: "完成战斗" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attack" })).not.toBeInTheDocument();
  });
});
