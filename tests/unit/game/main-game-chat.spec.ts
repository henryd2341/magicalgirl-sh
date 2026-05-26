import MainGameView from "@/pages/MainGameView.vue";
import {
  configureChatPersistenceClient,
  resetChatPersistenceClient,
} from "@/persistence/chatRuntime";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbVariableRepository } from "@/persistence/repositories/variableRepository";
import { DbRuntimeSnapshotRepository } from "@/persistence/repositories/runtimeSnapshotRepository";
import { router } from "@/router";
import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { usePromptViewerStore } from "@/stores/promptViewerStore";
import type { BattleParticipant } from "@/types/battle";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function createPlayerParty(): BattleParticipant[] {
  return [
    {
      id: "player-heroine-1",
      side: "player",
      displayName: "鹿目真昼",
      hp: {
        current: 120,
        max: 120,
      },
      mp: {
        current: 48,
        max: 48,
      },
      isDown: false,
      isActive: true,
    },
  ];
}

async function renderMainGameWithFreshPinia() {
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push("/game");
  await router.isReady();

  return render(MainGameView, {
    global: {
      plugins: [pinia, router],
    },
  });
}

describe("MainGameView chat persistence wiring", () => {
  beforeEach(() => {
    resetChatPersistenceClient();
  });

  afterEach(() => {
    resetChatPersistenceClient();
  });

  it("loads persisted chat messages from the db-backed store on mount", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    configureChatPersistenceClient(client);

    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    await store.configurePersistence({ client });
    await store.createUserMessage({
      id: "main-game-user-001",
      content: "我把掌心贴在冰凉的自动贩卖机外壳上。",
      createdAt: "2026-05-21T00:00:03.000Z",
    });

    await router.push("/game");
    await router.isReady();

    render(MainGameView, {
      global: {
        plugins: [pinia, router],
      },
    });

    expect(
      await screen.findByText("我把掌心贴在冰凉的自动贩卖机外壳上。"),
    ).toBeInTheDocument();
  });

  it("submits user input through the real chat store and restores it after remounting the page", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    configureChatPersistenceClient(client);

    const firstRender = await renderMainGameWithFreshPinia();

    const textbox = screen.getByRole("textbox", { name: "故事输入框" });
    await fireEvent.update(textbox, "  请继续描写车站天桥上的风。  ");
    await fireEvent.click(screen.getByRole("button", { name: "发送讯号" }));

    expect(
      await screen.findByText("请继续描写车站天桥上的风。"),
    ).toBeInTheDocument();

    firstRender.unmount();

    await renderMainGameWithFreshPinia();

    await waitFor(() => {
      expect(
        screen.getByText("请继续描写车站天桥上的风。"),
      ).toBeInTheDocument();
    });
  });

  it("routes session variable patches to the db-backed variable repository after mount", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    configureChatPersistenceClient(client);

    await renderMainGameWithFreshPinia();
    const sessionStore = useSessionStore();
    const variableRepository = new DbVariableRepository(client);

    await waitFor(async () => {
      await expect(variableRepository.getCurrent()).resolves.toMatchObject({
        stateHash: "initial",
      });
    });

    const result = await sessionStore.executeUpdateVariables({
      tool_name: "update_variables",
      request_id: "req-main-game-variable-db",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-main-game-variable-db",
      input: {
        patches: [
          {
            path: "world.location.name",
            value: "旧校舍",
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    await expect(variableRepository.getCurrent()).resolves.toMatchObject({
      version: 2,
      stateHash: result.ok ? result.output.nextHash : "",
      root: {
        world: {
          location: expect.objectContaining({
            name: "旧校舍",
          }),
        },
      },
    });
  });

  it("safe-rolls an interrupted battle back to idle after remounting with the same db worker", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    configureChatPersistenceClient(client);

    const firstRender = await renderMainGameWithFreshPinia();
    const chatStore = useChatStore();
    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    await chatStore.createUserMessage({
      id: "msg-before-refresh-combat",
      content: "我在安全线外停下脚步。",
      createdAt: "2026-05-25T00:03:00.000Z",
    });
    await sessionStore.markIdleCheckpointForRefreshRecovery();
    await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-refresh-battle",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-refresh-battle",
      input: {
        encounter_id: "enc-refresh-battle",
        enemies: [{ enemy_id: "refresh-shadow", count: 1 }],
        narrative_reason: "刷新恢复集成测试。",
      },
    });
    await sessionStore.startBattle(createPlayerParty());

    expect(sessionStore.snapshot.sessionState).toBe("IN_COMBAT");
    expect(battleStore.activeBattle).not.toBeNull();

    firstRender.unmount();

    await renderMainGameWithFreshPinia();
    const recoveredSessionStore = useSessionStore();
    const recoveredBattleStore = useBattleStore();

    await waitFor(() => {
      expect(recoveredSessionStore.snapshot.sessionState).toBe("IDLE");
      expect(recoveredBattleStore.pendingBattle).toBeNull();
      expect(recoveredBattleStore.activeBattle).toBeNull();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.getByText("检测到战斗中刷新，已回滚到战斗前安全状态。"),
      ).toBeInTheDocument();
    });
  });

  it("restores post-combat ready runtime state after remounting with the same db worker", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    configureChatPersistenceClient(client);

    await new DbRuntimeSnapshotRepository(client).saveCurrent({
      id: "current",
      updatedAt: "2026-05-26T00:00:00.000Z",
      sessionSnapshot: {
        sessionState: "POST_COMBAT_READY",
        pipelineState: null,
        activeRequestId: null,
      },
      pendingBattle: null,
      activeBattle: null,
    });

    const firstRender = await renderMainGameWithFreshPinia();

    expect(
      await screen.findByRole("button", { name: "继续剧情" }),
    ).toBeInTheDocument();

    firstRender.unmount();

    await renderMainGameWithFreshPinia();

    expect(
      await screen.findByRole("button", { name: "继续剧情" }),
    ).toBeInTheDocument();
    expect(useSessionStore().snapshot.sessionState).toBe("POST_COMBAT_READY");
  });

  it("renders the developer prompt viewer drawer with the latest Harness request", async () => {
    await renderMainGameWithFreshPinia();
    const viewerStore = usePromptViewerStore();

    viewerStore.record({
      metadata: {
        request_id: "req-preview-drawer",
        context_version: 7,
        state_hash: "hash-preview",
        issued_at: "2026-05-26T12:02:00.000Z",
      },
      segments: [
        {
          id: "system",
          kind: "system",
          title: "System Prompt",
          content: "drawer system prompt",
          source: "systemPrompt",
          tokenEstimate: 5,
          included: true,
        },
      ],
      traces: [
        {
          sourceId: "raw_entries/世界观基础",
          kind: "world_info",
          included: true,
          reason: "constant",
          priority: 1000,
        },
      ],
      messages: [],
      tools: [],
      promptText: "drawer system prompt",
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "开发者 Prompt Viewer" }),
    );

    expect(
      screen.getByRole("region", { name: "开发者 Prompt Viewer" }),
    ).toHaveAttribute("id", "prompt-viewer-drawer");
    expect(screen.getByText("drawer system prompt")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Traces" }));
    expect(screen.getByText("raw_entries/世界观基础")).toBeInTheDocument();
    expect(screen.getByText("constant")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Metadata" }));
    expect(screen.getByText("req-preview-drawer")).toBeInTheDocument();
    expect(screen.getByText("hash-preview")).toBeInTheDocument();
  });
});
