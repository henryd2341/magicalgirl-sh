import {
  hasBossProfile,
  registerBossProfile,
  type BossProfile,
} from "@/engine/battle/boss/bossRegistry";

const PROFILE_DEFINITIONS = [
  { id: "molten-core-serpent", actorEnemyIds: ["100"], initialPhase: "molten" },
  { id: "eternal-frost-beast", actorEnemyIds: ["101", "102", "103"], initialPhase: "fortified" },
  { id: "corrupted-crown-saint", actorEnemyIds: ["104"], initialPhase: "sowing" },
  { id: "echo-hunter", actorEnemyIds: ["105"], initialPhase: "recording" },
  { id: "chaos-doll", actorEnemyIds: ["106"], initialPhase: "integrity" },
  { id: "hidden-magical-girls", actorEnemyIds: ["107", "108"], initialPhase: "trial" },
] as const;

function createProfile(
  definition: (typeof PROFILE_DEFINITIONS)[number],
): BossProfile {
  return {
    ...definition,
    actorEnemyIds: [...definition.actorEnemyIds],
    skillIds: [],
    reduceEvent: () => [],
    selectForcedIntent: () => null,
    enumerateUtilityCandidates: () => [],
  };
}

export function registerChallengeBossProfiles(): void {
  for (const definition of PROFILE_DEFINITIONS) {
    if (!hasBossProfile(definition.id)) {
      registerBossProfile(createProfile(definition));
    }
  }
}
