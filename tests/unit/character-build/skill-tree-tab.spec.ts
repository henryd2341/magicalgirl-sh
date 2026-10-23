import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/vue";
import { reactive } from "vue";
import { getAllCharacterIds, getCharacter, getSkill } from "@/content/contentRegistry";
import * as registry from "@/content/contentRegistry";
import { SKILL_CATEGORIES } from "@/types/content";
import SkillTreeTab from "@/ui/character-build/SkillTreeTab.vue";

const fixture = vi.hoisted(() => ({
  store: {
    getVariableSnapshot: vi.fn(),
    learnSkill: vi.fn(),
    learnedSkills: new Map<string, Set<string>>(),
  },
}));
vi.mock("@/stores/sessionStore", () => ({ useSessionStore: () => fixture.store }));

const categoryLabels = { physical: "物理", magic: "魔法", heal: "回复", support: "辅助", passive: "被动" };
let notifyResize: () => void;

async function openTree() {
  const result = render(SkillTreeTab, { props: { characterId: "__player__" } });
  await screen.findByRole("combobox", { name: "技能分支" });
  return result;
}
async function category(name: string) {
  await fireEvent.click(screen.getByRole("button", { name: `${name}技能` }));
}
async function branch(id: string) {
  await fireEvent.update(screen.getByRole("combobox", { name: "技能分支" }), id);
}

beforeEach(() => {
  fixture.store.learnedSkills = reactive(new Map([["player", new Set(["0", "1"])]]));
  fixture.store.getVariableSnapshot.mockReset().mockResolvedValue({
    root: { player: { combat: { level: 99 }, money: 100000 }, characters: {} },
  });
  fixture.store.learnSkill.mockReset().mockResolvedValue("ok");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        notifyResize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SkillTreeTab", () => {
  it("defaults to one branch, exposes all branches and returns to a chosen branch", async () => {
    const { container } = await openTree();
    expect(container.querySelectorAll("[data-branch-id]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "全部分支" })).toHaveAttribute("aria-pressed", "false");
    await fireEvent.click(screen.getByRole("button", { name: "全部分支" }));
    expect(container.querySelectorAll("[data-branch-id]").length).toBeGreaterThan(1);
    const first = container.querySelector<HTMLElement>("[data-branch-id]")!;
    await fireEvent.click(within(first).getByRole("button", { name: /^只看/ }));
    expect(container.querySelectorAll("[data-branch-id]")).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "技能分支" })).toHaveValue(first.dataset.branchId);
    await category("辅助");
    expect(container.querySelectorAll("[data-branch-id]")).toHaveLength(1);
  });

  it("shows all five AND parents with truthful learned states and jumps across branches", async () => {
    fixture.store.learnedSkills.get("player")!.add("112");
    const { container } = await openTree();
    await category("辅助");
    await branch("125");
    const merge = container.querySelector<HTMLElement>('[data-merge-for="125"]')!;
    expect(within(merge).getByText("全部前置 · 1/5 已学习")).toBeInTheDocument();
    expect(merge.querySelectorAll("[data-prerequisite-id]")).toHaveLength(5);
    expect(merge.querySelector('[data-prerequisite-id="112"]')).toHaveAttribute("data-state", "learned");
    expect(merge.querySelector('[data-prerequisite-id="115"]')).toHaveAttribute("data-state", "missing");
    expect(container.querySelector('[data-skill-id="125"]')).toHaveAttribute("data-state", "locked");
    expect(screen.queryByRole("button", { name: "学习 元素防护" })).not.toBeInTheDocument();
    await fireEvent.click(merge.querySelector('[data-prerequisite-id="112"]')!);
    await waitFor(() => expect(container.querySelector('[data-skill-id="112"]')).toHaveFocus());
    expect(fixture.store.learnSkill).not.toHaveBeenCalled();
  });

  it("renders learned cross-category references and retains historic descendants with missing new parents", async () => {
    fixture.store.learnedSkills.get("player")!.add("104");
    fixture.store.learnedSkills.get("player")!.add("105");
    const { container } = await openTree();
    await category("魔法");
    await branch("105");
    expect(container.querySelector('[data-skill-id="105"]')).toHaveAttribute("data-state", "learned");
    const reference = container.querySelector<HTMLButtonElement>('[data-prerequisite-id="104"]')!;
    expect(reference).toHaveAttribute("data-state", "learned");
    expect(reference).toHaveAccessibleName(/查看 毒雾 · 辅助 · 已学习/);
    await fireEvent.click(reference);
    await waitFor(() => expect(container.querySelector('[data-skill-id="104"]')).toHaveFocus());
    expect(screen.getByRole("button", { name: "辅助技能" })).toHaveAttribute("aria-pressed", "true");

    fixture.store.learnedSkills.get("player")!.delete("104");
    await category("魔法");
    await branch("105");
    expect(container.querySelector('[data-skill-id="105"]')).toHaveAttribute("data-state", "learned");
    expect(container.querySelector('[data-prerequisite-id="104"]')).toHaveAttribute("data-state", "missing");
    expect(fixture.store.learnedSkills.get("player")!.has("104")).toBe(false);
  });

  it("leaves purchase authority in the store and keeps conditions after a rejected purchase", async () => {
    fixture.store.learnSkill.mockResolvedValue("insufficient_money");
    const { container } = await openTree();
    const button = screen.getAllByRole("button", { name: /^学习 / })[0];
    const card = button.closest<HTMLElement>("[data-skill-id]")!;
    await fireEvent.click(button);
    expect(fixture.store.learnSkill).toHaveBeenCalledWith("player", card.dataset.skillId);
    expect(await screen.findByRole("status")).toHaveTextContent("金钱不足");
    expect(container.querySelector(`[data-skill-id="${card.dataset.skillId}"]`)).toBeInTheDocument();
  });

  it("resets the scroll viewport on selection, supports keyboard scrolling and focusable native controls", async () => {
    await openTree();
    const viewport = screen.getByRole("region", { name: "物理技能树画布" });
    viewport.focus();
    await fireEvent.keyDown(viewport, { key: "ArrowRight" });
    await fireEvent.keyDown(viewport, { key: "ArrowDown" });
    expect(viewport.scrollLeft).toBe(160);
    expect(viewport.scrollTop).toBe(160);
    await fireEvent.click(screen.getByRole("button", { name: "全部分支" }));
    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(0);
    const select = screen.getByRole("combobox", { name: "技能分支" });
    select.focus();
    expect(select).toHaveFocus();
    await fireEvent.keyDown(select, { key: "ArrowDown" });
    expect(viewport.scrollTop).toBe(0);
  });

  it("centers a wide merge branch's target instead of leaving it outside the viewport", async () => {
    await openTree();
    await category("辅助");
    const viewport = screen.getByRole("region", { name: "辅助技能树画布" });
    Object.defineProperties(viewport, {
      clientWidth: { value: 700 },
      scrollWidth: { value: 1704 },
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ left: 100 } as DOMRect);
    const rect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.dataset.skillId === "125" ? ({ left: 812, width: 280 } as DOMRect) : rect.call(this);
    });
    await branch("125");
    expect(viewport.scrollLeft).toBe(502);
    await fireEvent.click(screen.getByRole("button", { name: "全部分支" }));
    expect(viewport.scrollLeft).toBe(0);
  });

  it("groups passives into prerequisite families with every real passive available", async () => {
    const { container } = await openTree();
    await category("被动");
    expect(container.querySelectorAll("[data-branch-id]")).toHaveLength(1);
    await fireEvent.click(screen.getByRole("button", { name: "全部分支" }));
    expect(container.querySelectorAll("[data-branch-id]").length).toBeGreaterThan(1);
    const count = getCharacter("player").skillTree.filter(
      (entry) => getSkill(entry.skillId).category === "passive",
    ).length;
    expect(container.querySelectorAll("[data-skill-id]")).toHaveLength(count);
    expect(container.querySelectorAll("svg")).toHaveLength(0);
    expect(container.querySelector('[data-prerequisite-id="112"]')).toBeInTheDocument();
  });

  it("uses rendered dimensions when recalculating paths after long text changes height", async () => {
    const { container } = await openTree();
    const graph = container.querySelector<HTMLElement>("[data-branch-graph]")!;
    const blocks = Array.from(graph.querySelectorAll<HTMLElement>("[data-skill-block]"));
    expect(blocks.length).toBeGreaterThan(1);
    vi.spyOn(graph, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
    let height = 520;
    blocks.forEach((block, index) => {
      vi.spyOn(block, "getBoundingClientRect").mockImplementation(
        () =>
          ({
            left: 24,
            top: index ? height + 120 : 24,
            width: 280,
            height: index ? 200 : height,
          }) as DOMRect,
      );
    });
    notifyResize();
    await waitFor(() => expect(graph.querySelector("path")?.getAttribute("d")).toContain("M 164 544"));
    height = 740;
    notifyResize();
    await waitFor(() => expect(graph.querySelector("path")?.getAttribute("d")).toContain("M 164 764"));
  });

  it("renders long names, descriptions and every locked condition without clipping or shrinking cards", async () => {
    const originalGetSkill = registry.getSkill;
    const name = "很长的完整技能名称用于检查换行";
    const description = "完整条件文字需要保留并由浏览器自动换行。".repeat(12);
    vi.spyOn(registry, "getSkill").mockImplementation((id) => {
      const skill = originalGetSkill(id);
      return id === "125" ? { ...skill, name, description } : skill;
    });
    fixture.store.getVariableSnapshot.mockResolvedValue({
      root: { player: { combat: { level: 1 }, money: 0 }, characters: {} },
    });
    const { container } = await openTree();
    await category("辅助");
    await branch("125");
    const card = container.querySelector<HTMLElement>('[data-skill-id="125"]')!;
    expect(within(card).getByRole("heading", { name })).toBeInTheDocument();
    expect(within(card).getByText(description)).toBeInTheDocument();
    expect(card).toHaveTextContent(/需要 Lv\.\d+ · 缺少前置技能 · 需要 \d+ G/);
    expect(container.querySelector('[data-branch-graph="125"]')).toHaveStyle({
      gridTemplateColumns: "repeat(5, 280px)",
    });
    expect(container.querySelector(".skilltree-tab__join")).toHaveStyle({ marginInline: "140px" });
  });

  it("refreshes after a successful purchase and restores focus to its learned card", async () => {
    fixture.store.learnSkill.mockImplementation(async (id, skillId) => {
      fixture.store.learnedSkills.get(id)!.add(skillId);
      return "ok";
    });
    const { container } = await openTree();
    const learn = screen.getAllByRole("button", { name: /^学习 / })[0];
    const skillId = learn.closest<HTMLElement>("[data-skill-id]")!.dataset.skillId;
    await fireEvent.click(learn);
    await waitFor(() => {
      const card = container.querySelector(`[data-skill-id="${skillId}"]`);
      expect(card).toHaveAttribute("data-state", "learned");
      expect(card).toHaveFocus();
    });
    expect(fixture.store.getVariableSnapshot).toHaveBeenCalledTimes(2);
  });

  it("keeps every skill reachable via category/all navigation for all seven real characters", async () => {
    const { container, rerender } = await openTree();
    let count = 0;
    for (const id of getAllCharacterIds()) {
      await rerender({ characterId: id });
      await screen.findByRole("navigation", { name: "技能分类" });
      for (const current of SKILL_CATEGORIES) {
        await category(categoryLabels[current]);
        const nodes = getCharacter(id).skillTree.filter((entry) => getSkill(entry.skillId).category === current);
        if (nodes.length) await fireEvent.click(screen.getByRole("button", { name: "全部分支" }));
        const shown = Array.from(container.querySelectorAll<HTMLElement>("[data-skill-id]"))
          .map((element) => element.dataset.skillId)
          .sort();
        expect(shown).toEqual(nodes.map((entry) => entry.skillId).sort());
        count += shown.length;
      }
    }
    expect(count).toBe(419);
  });

  it("shows load errors with a retry rather than offering purchases from stale values", async () => {
    fixture.store.getVariableSnapshot.mockRejectedValueOnce(new Error("storage"));
    render(SkillTreeTab, { props: { characterId: "__player__" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("读取角色进度失败");
    expect(screen.queryByRole("button", { name: /^学习 / })).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("combobox", { name: "技能分支" })).toBeInTheDocument();
  });
});
