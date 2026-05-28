/* eslint-disable no-unused-vars */

import { AiSdkProviderClient } from "@/orchestrator/aiSdkProviderClient";
import type { GameEngineFacade } from "@/engine/gameEngineFacade";
import {
  FakeStreamingProviderClient,
  type ProviderClient,
} from "@/orchestrator/providerClient";
import { deepClone } from "@/utils/deepClone";

const STORAGE_KEY_V1 = "magicalgirl-sh.provider-settings.v1";
const STORAGE_KEY_V2 = "magicalgirl-sh.provider-settings.v2";
export const BUILTIN_FAKE_PROFILE_ID = "builtin-fake";

export type ProviderProfileKind = "fake" | "openai-compatible";

export interface ProviderProfile {
  id: string;
  name: string;
  kind: ProviderProfileKind;
  baseURL: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxOutputTokens: number;
  streamingEnabled: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  builtIn: boolean;
  updatedAt: string;
}

export interface ProviderProfileInput {
  name: string;
  kind: ProviderProfileKind;
  baseURL: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxOutputTokens: number;
  streamingEnabled: boolean;
  reasoningEffort?: "low" | "medium" | "high";
}

export interface ProviderSettingsState {
  activeProfileId: string;
  profiles: ProviderProfile[];
  summaryProfileId: string | null;
  summaryEnabled: boolean;
  summaryTokenThreshold: number;
  summaryOldRatio: number;
}

export interface PromptViewerProviderInfo {
  profileName: string;
  kind: ProviderProfileKind;
  baseURL?: string;
  model?: string;
  hasApiKey: boolean;
  streamingEnabled: boolean;
}

export interface ProviderSettingsRepository {
  getState(): Promise<ProviderSettingsState>;
  saveState(state: ProviderSettingsState): Promise<void>;
  getActiveProfile(): Promise<ProviderProfile>;
  addProfile(input: ProviderProfileInput): Promise<ProviderProfile>;
  updateProfile(
    profileId: string,
    patch: Partial<ProviderProfileInput>,
  ): Promise<ProviderProfile>;
  deleteProfile(profileId: string): Promise<void>;
  setActiveProfile(profileId: string): Promise<void>;
  clearApiKey(profileId: string): Promise<void>;
  resetToDefault(): Promise<ProviderSettingsState>;
  setSummaryProfile(profileId: string | null): Promise<void>;
  updateSummaryConfig(patch: { summaryEnabled?: boolean; summaryTokenThreshold?: number; summaryOldRatio?: number }): Promise<void>;
}

export interface ProviderSettingsRepositoryOptions {
  now?: () => string;
  idFactory?: () => string;
}

export interface ConfiguredProviderClient {
  client: ProviderClient;
  providerInfo: PromptViewerProviderInfo;
}

interface ProviderSettingsConfigV1 {
  mode: "fake" | "ai-sdk-openai-compatible";
  providerName: string;
  baseURL: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxOutputTokens: number;
  updatedAt: string;
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultIdFactory(): string {
  return `profile-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeProfile(
  profile: ProviderProfile,
  updatedAt: string,
): ProviderProfile {
  return {
    id: profile.id.trim(),
    name: profile.name.trim() || "custom",
    kind: profile.kind,
    baseURL: profile.baseURL.trim(),
    model: profile.model.trim(),
    apiKey: profile.apiKey,
    temperature: normalizeNumber(profile.temperature, 0.7),
    maxOutputTokens: normalizeNumber(profile.maxOutputTokens, 1024),
    streamingEnabled: profile.streamingEnabled,
    reasoningEffort: profile.reasoningEffort,
    builtIn: profile.builtIn,
    updatedAt,
  };
}

function normalizeState(
  state: ProviderSettingsState,
  updatedAt: string,
): ProviderSettingsState {
  const profiles = state.profiles.map((profile) =>
    normalizeProfile(profile, profile.updatedAt || updatedAt),
  );
  const hasFakeProfile = profiles.some(
    (profile) => profile.id === BUILTIN_FAKE_PROFILE_ID,
  );
  const nextProfiles = hasFakeProfile
    ? profiles
    : [createBuiltInFakeProviderProfile(updatedAt), ...profiles];
  const activeProfileId = nextProfiles.some(
    (profile) => profile.id === state.activeProfileId,
  )
    ? state.activeProfileId
    : BUILTIN_FAKE_PROFILE_ID;

  return {
    activeProfileId,
    profiles: nextProfiles,
    summaryProfileId: state.summaryProfileId ?? null,
    summaryEnabled: state.summaryEnabled ?? true,
    summaryTokenThreshold: state.summaryTokenThreshold ?? 4000,
    summaryOldRatio: state.summaryOldRatio ?? 0.5,
  };
}

export function createBuiltInFakeProviderProfile(
  now: string = defaultNow(),
): ProviderProfile {
  return {
    id: BUILTIN_FAKE_PROFILE_ID,
    name: "Fake Provider",
    kind: "fake",
    baseURL: "",
    model: "",
    apiKey: "",
    temperature: 0.7,
    maxOutputTokens: 1024,
    streamingEnabled: true,
    builtIn: true,
    updatedAt: now,
  };
}

export function createDefaultProviderSettingsState(
  now: string = defaultNow(),
): ProviderSettingsState {
  return {
    activeProfileId: BUILTIN_FAKE_PROFILE_ID,
    profiles: [createBuiltInFakeProviderProfile(now)],
    summaryProfileId: null,
    summaryEnabled: true,
    summaryTokenThreshold: 4000,
    summaryOldRatio: 0.5,
  };
}

export function toPromptViewerProviderInfo(
  profile: ProviderProfile,
): PromptViewerProviderInfo {
  return {
    profileName: profile.name,
    kind: profile.kind,
    baseURL: profile.kind === "openai-compatible" ? profile.baseURL : undefined,
    model: profile.kind === "openai-compatible" ? profile.model : undefined,
    hasApiKey: profile.apiKey.trim().length > 0,
    streamingEnabled: profile.streamingEnabled,
  };
}

function createProfileFromInput(input: {
  id: string;
  updatedAt: string;
  builtIn: boolean;
  profile: ProviderProfileInput;
}): ProviderProfile {
  return normalizeProfile(
    {
      id: input.id,
      name: input.profile.name,
      kind: input.profile.kind,
      baseURL: input.profile.baseURL,
      model: input.profile.model,
      apiKey: input.profile.apiKey,
      temperature: input.profile.temperature,
      maxOutputTokens: input.profile.maxOutputTokens,
      streamingEnabled: input.profile.streamingEnabled,
      reasoningEffort: input.profile.reasoningEffort,
      builtIn: input.builtIn,
      updatedAt: input.updatedAt,
    },
    input.updatedAt,
  );
}

function applyProfilePatch(
  profile: ProviderProfile,
  patch: Partial<ProviderProfileInput>,
  updatedAt: string,
): ProviderProfile {
  return normalizeProfile(
    {
      ...profile,
      ...patch,
      kind: profile.builtIn ? profile.kind : (patch.kind ?? profile.kind),
      builtIn: profile.builtIn,
      updatedAt,
    },
    updatedAt,
  );
}

function findProfileOrThrow(
  state: ProviderSettingsState,
  profileId: string,
): ProviderProfile {
  const profile = state.profiles.find((candidate) => candidate.id === profileId);

  if (!profile) {
    throw new Error(`[PROVIDER_PROFILE_NOT_FOUND] Unknown profile: ${profileId}.`);
  }

  return profile;
}

function migrateV1Config(
  config: ProviderSettingsConfigV1,
  options: {
    now: string;
    idFactory: () => string;
  },
): ProviderSettingsState {
  const state = createDefaultProviderSettingsState(options.now);

  if (config.mode !== "ai-sdk-openai-compatible") {
    return state;
  }

  const migratedProfile = createProfileFromInput({
    id: options.idFactory(),
    updatedAt: config.updatedAt || options.now,
    builtIn: false,
    profile: {
      name: config.providerName,
      kind: "openai-compatible",
      baseURL: config.baseURL,
      model: config.model,
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      streamingEnabled: true,
    },
  });

  return {
    activeProfileId: migratedProfile.id,
    profiles: [state.profiles[0], migratedProfile],
    summaryProfileId: null,
    summaryEnabled: true,
    summaryTokenThreshold: 4000,
    summaryOldRatio: 0.5,
  };
}

export class InMemoryProviderSettingsRepository
  implements ProviderSettingsRepository
{
  private state: ProviderSettingsState | null = null;

  private readonly now: () => string;

  private readonly idFactory: () => string;

  public constructor(options: ProviderSettingsRepositoryOptions = {}) {
    this.now = options.now ?? defaultNow;
    this.idFactory = options.idFactory ?? defaultIdFactory;
  }

  public async getState(): Promise<ProviderSettingsState> {
    return deepClone(
      this.state ?? createDefaultProviderSettingsState(this.now()),
    );
  }

  public async saveState(state: ProviderSettingsState): Promise<void> {
    this.state = normalizeState(state, this.now());
  }

  public async getActiveProfile(): Promise<ProviderProfile> {
    const state = await this.getState();
    return deepClone(findProfileOrThrow(state, state.activeProfileId));
  }

  public async addProfile(
    input: ProviderProfileInput,
  ): Promise<ProviderProfile> {
    const state = await this.getState();
    const profile = createProfileFromInput({
      id: this.idFactory(),
      updatedAt: this.now(),
      builtIn: false,
      profile: input,
    });
    this.state = {
      ...state,
      profiles: [...state.profiles, profile],
    };

    return deepClone(profile);
  }

  public async updateProfile(
    profileId: string,
    patch: Partial<ProviderProfileInput>,
  ): Promise<ProviderProfile> {
    const state = await this.getState();
    const existing = findProfileOrThrow(state, profileId);
    const updated = applyProfilePatch(existing, patch, this.now());
    this.state = {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === profileId ? updated : profile,
      ),
    };

    return deepClone(updated);
  }

  public async deleteProfile(profileId: string): Promise<void> {
    const state = await this.getState();
    const profile = findProfileOrThrow(state, profileId);

    if (profile.builtIn) {
      throw new Error(
        `[PROVIDER_PROFILE_DELETE_FORBIDDEN] Cannot delete built-in profile: ${profileId}.`,
      );
    }

    const profiles = state.profiles.filter(
      (candidate) => candidate.id !== profileId,
    );
    this.state = {
      ...state,
      activeProfileId:
        state.activeProfileId === profileId
          ? BUILTIN_FAKE_PROFILE_ID
          : state.activeProfileId,
      profiles,
    };
  }

  public async setActiveProfile(profileId: string): Promise<void> {
    const state = await this.getState();
    findProfileOrThrow(state, profileId);
    this.state = {
      ...state,
      activeProfileId: profileId,
    };
  }

  public async clearApiKey(profileId: string): Promise<void> {
    await this.updateProfile(profileId, { apiKey: "" });
  }

  public async resetToDefault(): Promise<ProviderSettingsState> {
    this.state = createDefaultProviderSettingsState(this.now());
    return deepClone(this.state);
  }

  public async setSummaryProfile(profileId: string | null): Promise<void> {
    const state = await this.getState();
    if (profileId !== null) {
      findProfileOrThrow(state, profileId);
    }
    this.state = { ...state, summaryProfileId: profileId };
  }

  public async updateSummaryConfig(
    patch: { summaryEnabled?: boolean; summaryTokenThreshold?: number; summaryOldRatio?: number },
  ): Promise<void> {
    const state = await this.getState();
    this.state = {
      ...state,
      summaryEnabled: patch.summaryEnabled ?? state.summaryEnabled,
      summaryTokenThreshold: patch.summaryTokenThreshold ?? state.summaryTokenThreshold,
      summaryOldRatio: patch.summaryOldRatio ?? state.summaryOldRatio,
    };
  }
}

export class LocalStorageProviderSettingsRepository
  extends InMemoryProviderSettingsRepository
{
  private readonly nowForStorage: () => string;

  private readonly idFactoryForStorage: () => string;

  public constructor(options: ProviderSettingsRepositoryOptions = {}) {
    super(options);
    this.nowForStorage = options.now ?? defaultNow;
    this.idFactoryForStorage = options.idFactory ?? defaultIdFactory;
  }

  public override async getState(): Promise<ProviderSettingsState> {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY_V2);

    if (stored) {
      const parsed = JSON.parse(stored) as ProviderSettingsState;
      return normalizeState(parsed, this.nowForStorage());
    }

    const legacyStored = globalThis.localStorage?.getItem(STORAGE_KEY_V1);

    if (legacyStored) {
      const migrated = migrateV1Config(JSON.parse(legacyStored), {
        now: this.nowForStorage(),
        idFactory: this.idFactoryForStorage,
      });
      await this.saveState(migrated);
      return migrated;
    }

    return createDefaultProviderSettingsState(this.nowForStorage());
  }

  public override async saveState(
    state: ProviderSettingsState,
  ): Promise<void> {
    const normalized = normalizeState(state, this.nowForStorage());
    globalThis.localStorage?.setItem(STORAGE_KEY_V2, JSON.stringify(normalized));
  }

  public override async getActiveProfile(): Promise<ProviderProfile> {
    const state = await this.getState();
    return deepClone(findProfileOrThrow(state, state.activeProfileId));
  }

  public override async addProfile(
    input: ProviderProfileInput,
  ): Promise<ProviderProfile> {
    const state = await this.getState();
    const profile = createProfileFromInput({
      id: this.idFactoryForStorage(),
      updatedAt: this.nowForStorage(),
      builtIn: false,
      profile: input,
    });
    await this.saveState({
      ...state,
      profiles: [...state.profiles, profile],
    });

    return deepClone(profile);
  }

  public override async updateProfile(
    profileId: string,
    patch: Partial<ProviderProfileInput>,
  ): Promise<ProviderProfile> {
    const state = await this.getState();
    const existing = findProfileOrThrow(state, profileId);
    const updated = applyProfilePatch(existing, patch, this.nowForStorage());
    await this.saveState({
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === profileId ? updated : profile,
      ),
    });

    return deepClone(updated);
  }

  public override async deleteProfile(profileId: string): Promise<void> {
    const state = await this.getState();
    const profile = findProfileOrThrow(state, profileId);

    if (profile.builtIn) {
      throw new Error(
        `[PROVIDER_PROFILE_DELETE_FORBIDDEN] Cannot delete built-in profile: ${profileId}.`,
      );
    }

    await this.saveState({
      ...state,
      activeProfileId:
        state.activeProfileId === profileId
          ? BUILTIN_FAKE_PROFILE_ID
          : state.activeProfileId,
      profiles: state.profiles.filter(
        (candidate) => candidate.id !== profileId,
      ),
    });
  }

  public override async setActiveProfile(profileId: string): Promise<void> {
    const state = await this.getState();
    findProfileOrThrow(state, profileId);
    await this.saveState({
      ...state,
      activeProfileId: profileId,
    });
  }

  public override async resetToDefault(): Promise<ProviderSettingsState> {
    const state = createDefaultProviderSettingsState(this.nowForStorage());
    await this.saveState(state);
    return deepClone(state);
  }

  public override async setSummaryProfile(profileId: string | null): Promise<void> {
    const state = await this.getState();
    if (profileId !== null) {
      findProfileOrThrow(state, profileId);
    }
    await this.saveState({ ...state, summaryProfileId: profileId });
  }

  public override async updateSummaryConfig(
    patch: { summaryEnabled?: boolean; summaryTokenThreshold?: number; summaryOldRatio?: number },
  ): Promise<void> {
    const state = await this.getState();
    await this.saveState({
      ...state,
      summaryEnabled: patch.summaryEnabled ?? state.summaryEnabled,
      summaryTokenThreshold: patch.summaryTokenThreshold ?? state.summaryTokenThreshold,
      summaryOldRatio: patch.summaryOldRatio ?? state.summaryOldRatio,
    });
  }
}

export async function createConfiguredSummaryProviderClient(
  repository: ProviderSettingsRepository = getProviderSettingsRepository(),
): Promise<ConfiguredProviderClient> {
  const state = await repository.getState();

  if (state.summaryProfileId) {
    const profile = state.profiles.find((p) => p.id === state.summaryProfileId);
    if (profile) {
      return createConfiguredProviderClient(
        {
          getActiveProfile: async () => profile,
        } as ProviderSettingsRepository,
      );
    }
  }

  // Fall back to active profile
  return createConfiguredProviderClient(repository);
}

export async function createConfiguredProviderClient(
  repository: ProviderSettingsRepository = getProviderSettingsRepository(),
  harnessDeps?: {
    dispatchCommand: GameEngineFacade["dispatchCommand"];
  },
): Promise<ConfiguredProviderClient> {
  const profile = await repository.getActiveProfile();

  if (profile.kind === "fake") {
    return {
      client: new FakeStreamingProviderClient({}),
      providerInfo: toPromptViewerProviderInfo(profile),
    };
  }

  if (!profile.baseURL || !profile.model) {
    throw new Error(
      "[PROVIDER_SETTINGS_INVALID] OpenAI-compatible provider requires Base URL and Model.",
    );
  }

  return {
    client: new AiSdkProviderClient({
      providerName: profile.name,
      baseURL: profile.baseURL,
      model: profile.model,
      apiKey: profile.apiKey,
      temperature: profile.temperature,
      maxOutputTokens: profile.maxOutputTokens,
      streamingEnabled: profile.streamingEnabled,
      reasoningEffort: profile.reasoningEffort,
      harnessDeps: harnessDeps ?? { dispatchCommand: (async () => { throw new Error("[PROVIDER_NO_HARNESS_DEPS] harnessDeps not provided."); }) as unknown as GameEngineFacade["dispatchCommand"] },
    }),
    providerInfo: toPromptViewerProviderInfo(profile),
  };
}

const providerSettingsRepository = new LocalStorageProviderSettingsRepository();

export function getProviderSettingsRepository(): ProviderSettingsRepository {
  return providerSettingsRepository;
}
