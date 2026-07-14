import type {
  BossActionIntent,
  BossBattleEvent,
  BossContext,
  BossEffect,
  BossUtilityCandidate,
} from "@/engine/battle/boss/bossTypes";

export interface BossProfile {
  id: string;
  actorEnemyIds: string[];
  initialPhase: string;
  skillIds: string[];
  reduceEvent(context: BossContext, event: BossBattleEvent): BossEffect[];
  selectForcedIntent(context: BossContext): BossActionIntent | null;
  enumerateUtilityCandidates(context: BossContext): BossUtilityCandidate[];
}

const profiles = new Map<string, BossProfile>();

export function registerBossProfile(profile: BossProfile): void {
  if (profiles.has(profile.id)) {
    throw new Error(`Boss profile already registered: "${profile.id}"`);
  }
  profiles.set(profile.id, profile);
}

export function getBossProfile(id: string): BossProfile {
  const profile = profiles.get(id);
  if (profile == null) {
    throw new Error(`Boss profile not registered: "${id}"`);
  }
  return profile;
}

export function hasBossProfile(id: string): boolean {
  return profiles.has(id);
}

export function clearBossProfilesForTests(): void {
  profiles.clear();
}
