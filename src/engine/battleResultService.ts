/* eslint-disable no-unused-vars */

import { createBattleSummaries } from "@/engine/battle/battleSummary";
import type { CreateBattleSummaryMessageInput } from "@/engine/chatMessageService";
import type { BattleSnapshot, BattleSummarySet } from "@/types/battle";
import type { ChatMessage } from "@/types/chat";

export interface BattleSummaryMessageWriter {
  createBattleSummaryMessages(
    inputs: CreateBattleSummaryMessageInput[],
  ): Promise<ChatMessage[]>;
}

export interface BattleResultServiceDependencies {
  chatService: BattleSummaryMessageWriter;
  now?: () => string;
}

export interface CommitResolvedBattleResult {
  summaries: BattleSummarySet;
  messages: ChatMessage[];
}

function createUnresolvedBattleResultError(): Error {
  return new Error(
    "[BATTLE_RESULT_UNRESOLVED] Cannot commit battle result before RESULT.",
  );
}

function requireResolvedBattle(snapshot: BattleSnapshot): void {
  if (
    snapshot.lifecycleState !== "RESOLVED" ||
    snapshot.phase !== "RESULT" ||
    snapshot.battleResult == null
  ) {
    throw createUnresolvedBattleResultError();
  }
}

function createSummaryMessageInputs(
  snapshot: BattleSnapshot,
  summaries: BattleSummarySet,
  createdAt: string,
): CreateBattleSummaryMessageInput[] {
  const idPrefix = `battle-summary-${snapshot.encounterId}`;

  return [
    {
      id: `${idPrefix}-verbose`,
      level: "verbose",
      content: summaries.verbose,
      userVisible: false,
      aiVisible: false,
      createdAt,
    },
    {
      id: `${idPrefix}-default`,
      level: "default",
      content: summaries.default,
      userVisible: true,
      aiVisible: false,
      createdAt,
    },
    {
      id: `${idPrefix}-minimal`,
      level: "minimal",
      content: summaries.minimal,
      userVisible: false,
      aiVisible: true,
      createdAt,
    },
  ];
}

export class BattleResultService {
  private readonly chatService: BattleSummaryMessageWriter;

  private readonly now: () => string;

  public constructor(dependencies: BattleResultServiceDependencies) {
    this.chatService = dependencies.chatService;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public async commitResolvedBattle(
    snapshot: BattleSnapshot,
  ): Promise<CommitResolvedBattleResult> {
    requireResolvedBattle(snapshot);

    const summaries = createBattleSummaries(snapshot);
    const messages = await this.chatService.createBattleSummaryMessages(
      createSummaryMessageInputs(snapshot, summaries, this.now()),
    );

    return {
      summaries,
      messages,
    };
  }
}
