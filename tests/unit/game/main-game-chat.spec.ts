import MainGameView from "@/pages/MainGameView.vue";
import {
  configureChatPersistenceClient,
  resetChatPersistenceClient,
} from "@/persistence/chatRuntime";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { router } from "@/router";
import { useChatStore } from "@/stores/chatStore";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
});
