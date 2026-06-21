import { AiSdkProviderClient } from "@/orchestrator/aiSdkProviderClient";
import { FakeStreamingProviderClient } from "@/orchestrator/providerClient";
import {
  createConfiguredProviderClient,
  createDefaultProviderSettingsState,
  InMemoryProviderSettingsRepository,
  LocalStorageProviderSettingsRepository,
  toPromptViewerProviderInfo,
} from "@/orchestrator/providerSettings";
import { beforeEach, describe, expect, it } from "vitest";

describe("provider settings profiles", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it("defaults to an active built-in fake provider profile", () => {
    expect(createDefaultProviderSettingsState("2026-05-27T12:00:00.000Z"))
      .toEqual({
        activeProfileId: "builtin-fake",
        profiles: [
          {
            id: "builtin-fake",
            name: "Fake Provider",
            kind: "fake",
            baseURL: "",
            model: "",
            apiKey: "",
            temperature: 0.7,
            maxOutputTokens: 1024,
            streamingEnabled: true,
            builtIn: true,
            updatedAt: "2026-05-27T12:00:00.000Z",
          },
        ],
        summaryProfileId: null,
        summaryEnabled: true,
        summaryTokenThreshold: 4000,
        summaryOldRatio: 0.5,
        summaryMinMessages: 6,
        toolProfileIds: {},
      });
  });

  it("adds, updates, activates, clears, and deletes provider profiles while preserving the fake profile", async () => {
    const repository = new InMemoryProviderSettingsRepository({
      now: () => "2026-05-27T12:03:00.000Z",
      idFactory: () => "profile-local-001",
    });

    const created = await repository.addProfile({
      name: "LM Studio",
      kind: "openai-compatible",
      baseURL: " http://localhost:1234/v1 ",
      model: "local-model",
      apiKey: "secret-key",
      temperature: 0.2,
      maxOutputTokens: 4096,
      streamingEnabled: false,
    });

    expect(created).toMatchObject({
      id: "profile-local-001",
      baseURL: "http://localhost:1234/v1",
      streamingEnabled: false,
      builtIn: false,
    });

    await repository.setActiveProfile("profile-local-001");
    await repository.updateProfile("profile-local-001", {
      model: "updated-model",
      temperature: 0.4,
    });
    await repository.clearApiKey("profile-local-001");

    await expect(repository.getActiveProfile()).resolves.toMatchObject({
      id: "profile-local-001",
      model: "updated-model",
      apiKey: "",
      temperature: 0.4,
    });

    await repository.deleteProfile("profile-local-001");
    await expect(repository.getState()).resolves.toMatchObject({
      activeProfileId: "builtin-fake",
      profiles: [
        expect.objectContaining({
          id: "builtin-fake",
          builtIn: true,
        }),
      ],
    });

    await expect(repository.deleteProfile("builtin-fake")).rejects.toThrow(
      "[PROVIDER_PROFILE_DELETE_FORBIDDEN]",
    );
  });

  it("migrates K4 v1 localStorage settings into a v2 active profile", async () => {
    globalThis.localStorage.setItem(
      "magicalgirl-sh.provider-settings.v1",
      JSON.stringify({
        mode: "ai-sdk-openai-compatible",
        providerName: "gateway",
        baseURL: "https://api.example.test/v1",
        model: "story-model",
        apiKey: "secret-key",
        temperature: 0.5,
        maxOutputTokens: 2048,
        updatedAt: "2026-05-27T12:06:00.000Z",
      }),
    );
    const repository = new LocalStorageProviderSettingsRepository({
      now: () => "2026-05-27T12:07:00.000Z",
      idFactory: () => "profile-migrated",
    });

    await expect(repository.getState()).resolves.toMatchObject({
      activeProfileId: "profile-migrated",
      profiles: [
        expect.objectContaining({ id: "builtin-fake" }),
        expect.objectContaining({
          id: "profile-migrated",
          name: "gateway",
          kind: "openai-compatible",
          baseURL: "https://api.example.test/v1",
          model: "story-model",
          apiKey: "secret-key",
          streamingEnabled: true,
        }),
      ],
    });
  });

  it("creates fake or AI SDK provider clients from the active profile", async () => {
    const repository = new InMemoryProviderSettingsRepository({
      now: () => "2026-05-27T12:04:00.000Z",
      idFactory: () => "profile-gateway",
    });

    await expect(createConfiguredProviderClient(repository)).resolves
      .toMatchObject({
        client: expect.any(FakeStreamingProviderClient),
        providerInfo: {
          profileName: "Fake Provider",
          kind: "fake",
          hasApiKey: false,
          streamingEnabled: true,
        },
      });

    await repository.addProfile({
      name: "gateway",
      kind: "openai-compatible",
      baseURL: "https://api.example.test/v1",
      model: "story-model",
      apiKey: "secret-key",
      temperature: 0.5,
      maxOutputTokens: 2048,
      streamingEnabled: false,
    });
    await repository.setActiveProfile("profile-gateway");

    await expect(createConfiguredProviderClient(repository)).resolves
      .toMatchObject({
        client: expect.any(AiSdkProviderClient),
        providerInfo: {
          profileName: "gateway",
          kind: "openai-compatible",
          baseURL: "https://api.example.test/v1",
          model: "story-model",
          hasApiKey: true,
          streamingEnabled: false,
        },
      });
  });

  it("rejects incomplete active OpenAI-compatible profiles before a provider request starts", async () => {
    const repository = new InMemoryProviderSettingsRepository({
      now: () => "2026-05-27T12:05:00.000Z",
      idFactory: () => "profile-incomplete",
    });
    await repository.addProfile({
      name: "gateway",
      kind: "openai-compatible",
      baseURL: "",
      model: "story-model",
      apiKey: "secret-key",
      temperature: 0.5,
      maxOutputTokens: 2048,
      streamingEnabled: true,
    });
    await repository.setActiveProfile("profile-incomplete");

    await expect(createConfiguredProviderClient(repository)).rejects.toThrow(
      "[PROVIDER_SETTINGS_INVALID]",
    );
  });

  it("redacts the API key from Prompt Viewer provider metadata", () => {
    expect(
      toPromptViewerProviderInfo({
        id: "profile-gateway",
        name: "gateway",
        kind: "openai-compatible",
        baseURL: "https://api.example.test/v1",
        model: "story-model",
        apiKey: "secret-key",
        temperature: 0.5,
        maxOutputTokens: 2048,
        streamingEnabled: false,
        builtIn: false,
        updatedAt: "2026-05-27T12:06:00.000Z",
      }),
    ).toEqual({
      profileName: "gateway",
      kind: "openai-compatible",
      baseURL: "https://api.example.test/v1",
      model: "story-model",
      hasApiKey: true,
      streamingEnabled: false,
    });
  });
});
