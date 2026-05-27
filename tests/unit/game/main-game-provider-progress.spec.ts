import type {
  BuiltProviderRequest,
  ProviderToolCallCandidate,
} from "@/orchestrator/harnessContextTypes";
import type {
  ProviderClient,
  ProviderStreamCallbacks,
  ProviderStreamResult,
} from "@/orchestrator/providerClient";
import {
  configureChatPersistenceClient,
  resetChatPersistenceClient,
} from "@/persistence/chatRuntime";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { router } from "@/router";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  deferred: null as null | {
    resolve: () => void;
    promise: Promise<void>;
  },
}));

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settled) => {
    resolve = settled;
  });
  return { resolve, promise };
}

class DeferredProviderClient implements ProviderClient {
  public async stream(
    _request: BuiltProviderRequest,
    callbacks: ProviderStreamCallbacks,
  ): Promise<ProviderStreamResult> {
    await providerMocks.deferred?.promise;
    await callbacks.onTextChunk("收到讯号，叙事继续。");

    return {
      finishReason: "stop",
      toolCalls: [] as ProviderToolCallCandidate[],
    };
  }
}

vi.mock("@/orchestrator/providerSettings", () => ({
  createConfiguredProviderClient: vi.fn(async () => ({
    client: new DeferredProviderClient(),
    providerInfo: {
      mode: "fake",
      providerName: "deferred-test",
      hasApiKey: false,
    },
  })),
}));

describe("MainGameView provider progress feedback", () => {
  beforeEach(() => {
    resetChatPersistenceClient();
    providerMocks.deferred = createDeferred();
  });

  afterEach(() => {
    resetChatPersistenceClient();
    providerMocks.deferred = null;
  });

  it("shows the submitted user message and locks input while provider streaming is pending", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    configureChatPersistenceClient(client);

    const pinia = createPinia();
    setActivePinia(pinia);
    await router.push("/game");
    await router.isReady();
    const { default: MainGameView } = await import("@/pages/MainGameView.vue");

    render(MainGameView, {
      global: {
        plugins: [pinia, router],
      },
    });

    const textbox = screen.getByRole("textbox", { name: "故事输入框" });
    await fireEvent.update(textbox, "确认讯号是否发送。");
    await fireEvent.click(screen.getByRole("button", { name: "发送讯号" }));

    expect(await screen.findByText("确认讯号是否发送。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送讯号" })).toBeDisabled();
    expect(textbox).toBeDisabled();

    providerMocks.deferred?.resolve();

    expect(await screen.findByText("收到讯号，叙事继续。")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送讯号" })).toBeEnabled();
      expect(screen.getByRole("textbox", { name: "故事输入框" })).toBeEnabled();
    });
  });
});
