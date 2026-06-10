/* eslint-disable no-unused-vars */

import { createBattleSummaries } from "@/engine/battle/battleSummary";
import type { CreateBattleSummaryMessageInput } from "@/engine/chatMessageService";
import type { BattleSnapshot, BattleSummarySet } from "@/types/battle";
import type { ChatMessage } from "@/types/chat";
import { getEnemyByName } from "@/content/contentRegistry";
import { calculateExpGained } from "@/engine/battle/formulaEngine";
import {
  collectPassives,
  applyPassivesAtHook,
} from "@/engine/battle/passiveEffectEngine";

export interface BattleSummaryMessageWriter {
  createBattleSummaryMessages(
    inputs: CreateBattleSummaryMessageInput[],
  ): Promise<ChatMessage[]>;
}

export interface BattleResultServiceDependencies {
  chatService: BattleSummaryMessageWriter;
  now?: () => string;
}

export interface BattleRewards {
  expGained: number;
  characterExp: Map<string, number>;
  moneyGained: number;
  enemyIds: string[];
}

export interface CommitResolvedBattleResult {
  summaries: BattleSummarySet;
  messages: ChatMessage[];
  rewards: BattleRewards;
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

  public computeRewards(snapshot: BattleSnapshot): BattleRewards {
    requireResolvedBattle(snapshot);

    if (snapshot.battleResult?.outcome !== "victory") {
      return { expGained: 0, characterExp: new Map(), moneyGained: 0, enemyIds: [] };
    }

    const playerLevel = snapshot.participants
      .filter((p) => p.side === "player")
      .reduce((max, p) => Math.max(max, p.level ?? 1), 1);

    let totalExpGained = 0;
    let moneyGained = 0;
    const enemyIds: string[] = [];

    for (const participant of snapshot.participants) {
      if (participant.side !== "enemy" || !participant.isDown) continue;
      enemyIds.push(participant.id);
      try {
        const enemyDef = getEnemyByName(participant.displayName);
        totalExpGained += calculateExpGained(
          enemyDef.expReward,
          enemyDef.baseLevel,
          playerLevel,
        );
        moneyGained += enemyDef.moneyReward;
      } catch {
        // Enemy not in content registry, skip
      }
    }

    // Distribute EXP to each surviving player character, applying exp_boost passives
    const survivingPlayers = snapshot.participants.filter(
      (p) => p.side === "player" && !p.isDown,
    );
    const characterExp = new Map<string, number>();

    if (survivingPlayers.length > 0) {
      const baseExpPerPlayer = Math.floor(totalExpGained / survivingPlayers.length);
      let remainder = totalExpGained - baseExpPerPlayer * survivingPlayers.length;

      for (const player of survivingPlayers) {
        let exp = baseExpPerPlayer + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;

        // Apply exp_boost passives
        const passives = collectPassives(player.passiveEffects);
        const ctx = applyPassivesAtHook(passives, "on_exp_calc", { exp }) as { exp: number };
        exp = ctx.exp;

        characterExp.set(player.characterId ?? player.id, exp);
      }
    }

    // expGained is total for backward compatibility
    let expGained = 0;
    for (const exp of characterExp.values()) {
      expGained += exp;
    }

    return { expGained, characterExp, moneyGained, enemyIds };
  }

    public async commitResolvedBattle(
    snapshot: BattleSnapshot,
  ): Promise<CommitResolvedBattleResult> {
    requireResolvedBattle(snapshot);

    const summaries = createBattleSummaries(snapshot);
    const messages = await this.chatService.createBattleSummaryMessages(
      createSummaryMessageInputs(snapshot, summaries, this.now()),
    );
    const rewards = this.computeRewards(snapshot);

    return {
      summaries,
      messages,
      rewards,
    };
  }
}
