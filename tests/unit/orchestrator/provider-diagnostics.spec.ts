import {
  listProviderModels,
  testProviderConnection,
} from "@/orchestrator/providerDiagnostics";
import type { ProviderProfile } from "@/orchestrator/providerSettings";
import { beforeEach, describe, expect, it, vi } from "vitest";

function profile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: "profile-gateway",
    name: "Gateway",
    kind: "openai-compatible",
    baseURL: "https://api.example.test/v1",
    model: "story-model",
    apiKey: "secret-key",
    temperature: 0.7,
    maxOutputTokens: 1024,
    streamingEnabled: true,
    builtIn: false,
    updatedAt: "2026-05-27T13:00:00.000Z",
    ...overrides,
  };
}

describe("provider diagnostics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists OpenAI-compatible models from the fixed /models endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      globalThis.Response.json({
        data: [{ id: "model-a" }, { id: "model-b" }],
      }),
    );

    await expect(
      listProviderModels(profile(), { fetch: fetchMock }),
    ).resolves.toEqual({
      ok: true,
      models: ["model-a", "model-b"],
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/v1/models", {
      headers: {
        Authorization: "Bearer secret-key",
      },
    });
  });

  it("reports successful connection when /models returns a valid model list", async () => {
    await expect(
      testProviderConnection(profile(), {
        fetch: vi.fn(async () =>
          globalThis.Response.json({
            data: [{ id: "model-a" }],
          }),
        ),
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: "success",
      models: ["model-a"],
    });
  });

  it("classifies auth and network/CORS failures", async () => {
    await expect(
      testProviderConnection(profile(), {
        fetch: vi.fn(async () => new globalThis.Response("no", { status: 401 })),
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: "auth_error",
    });

    await expect(
      testProviderConnection(profile(), {
        fetch: vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        }),
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: "network_or_cors_error",
    });
  });

  it("reports missing config and invalid model responses", async () => {
    await expect(
      testProviderConnection(profile({ baseURL: "" }), {
        fetch: vi.fn(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: "missing_config",
    });

    await expect(
      testProviderConnection(profile(), {
        fetch: vi.fn(async () =>
          globalThis.Response.json({
            data: [{ object: "model" }],
          }),
        ),
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: "invalid_response",
    });
  });
});
