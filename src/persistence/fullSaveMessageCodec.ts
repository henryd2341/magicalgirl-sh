import { z } from "zod";
import type {
  FullSaveExportV2,
  FullSaveExportV3,
} from "@/persistence/exportSave";
import type { ChatMessage } from "@/types/chat";
import { deepClone } from "@/utils/deepClone";

const messageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    kind: z.enum([
      "normal",
      "battle_summary",
      "failed_draft",
      "context_summary",
    ]),
    summary_level: z.enum(["verbose", "default", "minimal"]).optional(),
    content: z.string(),
    reasoning: z.string().optional(),
    user_visible: z.boolean(),
    ai_visible: z.boolean(),
    provisional: z.boolean(),
    finalized: z.boolean(),
    failed: z.boolean(),
    request_id: z.string().optional(),
    context_version: z.number().optional(),
    tool_call_id: z.string().optional(),
    created_at: z.string(),
  })
  .passthrough();

export function encodeFullSaveV3(payload: FullSaveExportV2): FullSaveExportV3 {
  const messagePool: ChatMessage[] = [];
  const indexes = new Map<string, number>();
  function intern(message: ChatMessage): number {
    // Compare JSON-visible values, independent of object insertion order.
    const key = JSON.stringify(message, (_key, value) =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value,
    );
    const existing = indexes.get(key);
    if (existing !== undefined) return existing;
    const index = messagePool.length;
    indexes.set(key, index);
    messagePool.push(JSON.parse(key) as ChatMessage);
    return index;
  }

  const { chatMessages, checkpointSnapshots, ...data } = payload.data;
  const chatMessageRefs = chatMessages.map(intern);
  return {
    ...payload,
    version: 3,
    data: {
      ...data,
      messagePool,
      chatMessageRefs,
      checkpointSnapshots: checkpointSnapshots.map(
        ({ chatMessages, ...checkpoint }) => ({
          ...checkpoint,
          chatMessageRefs: chatMessages.map(intern),
        }),
      ),
    },
  };
}

export function decodeFullSaveV3Data(
  data: Record<string, unknown>,
): FullSaveExportV2["data"] {
  const { messagePool, chatMessageRefs, checkpointSnapshots, ...rest } = data;
  if (
    !Array.isArray(messagePool) ||
    !messagePool.every((message) => messageSchema.safeParse(message).success)
  ) {
    throw new Error(
      "[FULL_SAVE_IMPORT_INVALID] Missing or invalid data.messagePool.",
    );
  }
  const pool = messagePool as ChatMessage[];
  function expand(refs: unknown): ChatMessage[] {
    if (
      !Array.isArray(refs) ||
      !refs.every(
        (ref) => Number.isInteger(ref) && ref >= 0 && ref < pool.length,
      )
    ) {
      throw new Error(
        "[FULL_SAVE_IMPORT_INVALID] Missing or invalid chatMessageRefs.",
      );
    }
    return refs.map((ref: number) => deepClone(pool[ref]!));
  }

  if (!Array.isArray(checkpointSnapshots)) {
    throw new Error(
      "[FULL_SAVE_IMPORT_INVALID] Missing or invalid data.checkpointSnapshots.",
    );
  }
  return {
    ...rest,
    chatMessages: expand(chatMessageRefs),
    checkpointSnapshots: checkpointSnapshots.map((checkpoint: unknown) => {
      if (
        typeof checkpoint !== "object" ||
        checkpoint === null ||
        Array.isArray(checkpoint)
      ) {
        throw new Error(
          "[FULL_SAVE_IMPORT_INVALID] Invalid checkpoint snapshot.",
        );
      }
      const { chatMessageRefs, ...snapshot } = checkpoint as Record<
        string,
        unknown
      >;
      return { ...snapshot, chatMessages: expand(chatMessageRefs) };
    }),
  } as FullSaveExportV2["data"];
}
