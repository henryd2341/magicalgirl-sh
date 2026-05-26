import type { SessionSnapshot } from "@/engine/sessionManager";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";

export interface RuntimeSnapshotRecord {
  id: "current";
  updatedAt: string;
  sessionSnapshot: SessionSnapshot;
  pendingBattle: PendingBattleSnapshot | null;
  activeBattle: BattleSnapshot | null;
}
