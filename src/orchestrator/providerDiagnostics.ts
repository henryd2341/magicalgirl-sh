import type { ProviderProfile } from "@/orchestrator/providerSettings";

export type ProviderConnectionStatus =
  | "success"
  | "auth_error"
  | "network_or_cors_error"
  | "invalid_response"
  | "missing_config";

export type ProviderModelsResult =
  | {
      ok: true;
      models: string[];
    }
  | {
      ok: false;
      status: Exclude<ProviderConnectionStatus, "success">;
      message: string;
      models?: string[];
    };

export type ProviderConnectionResult =
  | {
      ok: true;
      status: "success";
      models: string[];
      message: string;
    }
  | {
      ok: false;
      status: Exclude<ProviderConnectionStatus, "success">;
      models?: string[];
      message: string;
    };

export interface ProviderDiagnosticDependencies {
  fetch?: typeof globalThis.fetch;
}

function getFetch(
  dependencies: ProviderDiagnosticDependencies = {},
): typeof globalThis.fetch {
  return dependencies.fetch ?? globalThis.fetch.bind(globalThis);
}

function createModelsUrl(baseURL: string): string {
  return `${baseURL.trim().replace(/\/+$/, "")}/models`;
}

function parseModelIds(payload: unknown): string[] | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { data?: unknown }).data)
  ) {
    return null;
  }

  const ids = (payload as { data: unknown[] }).data
    .map((entry) =>
      typeof entry === "object" && entry !== null
        ? (entry as { id?: unknown }).id
        : null,
    )
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  return ids.length > 0 ? ids : null;
}

function toErrorResult(
  status: Exclude<ProviderConnectionStatus, "success">,
  message: string,
): ProviderModelsResult {
  return {
    ok: false,
    status,
    message,
  };
}

export async function listProviderModels(
  profile: ProviderProfile,
  dependencies: ProviderDiagnosticDependencies = {},
): Promise<ProviderModelsResult> {
  if (profile.kind === "fake") {
    return toErrorResult(
      "missing_config",
      "Fake provider does not support model listing.",
    );
  }

  if (profile.kind === "deepseek" && !profile.apiKey?.trim()) {
    return toErrorResult(
      "missing_config",
      "DeepSeek API Key is required before listing models.",
    );
  }

  if (
    profile.kind === "openai-compatible" &&
    profile.baseURL.trim() === ""
  ) {
    return toErrorResult(
      "missing_config",
      "OpenAI-compatible Base URL is required before listing models.",
    );
  }

  const baseURL =
    profile.kind === "deepseek"
      ? profile.baseURL.trim() || "https://api.deepseek.com/v1"
      : profile.baseURL;

  try {
    const headers: Record<string, string> = {};
    const apiKey = profile.apiKey.trim();

    if (apiKey.length > 0) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await getFetch(dependencies)(createModelsUrl(baseURL), {
      headers,
    });

    if (response.status === 401 || response.status === 403) {
      return toErrorResult("auth_error", "Provider rejected the API key.");
    }

    if (!response.ok) {
      return toErrorResult(
        "invalid_response",
        `Provider returned HTTP ${response.status}.`,
      );
    }

    const modelIds = parseModelIds(await response.json());

    if (!modelIds) {
      return toErrorResult(
        "invalid_response",
        "Provider /models response did not include data[].id.",
      );
    }

    return {
      ok: true,
      models: modelIds,
    };
  } catch (error) {
    return toErrorResult(
      "network_or_cors_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function testProviderConnection(
  profile: ProviderProfile,
  dependencies: ProviderDiagnosticDependencies = {},
): Promise<ProviderConnectionResult> {
  const result = await listProviderModels(profile, dependencies);

  if (result.ok) {
    return {
      ok: true,
      status: "success",
      models: result.models,
      message: `Connected. ${result.models.length} model(s) available.`,
    };
  }

  return {
    ok: false,
    status: result.status,
    models: result.models,
    message: result.message,
  };
}
