import { chaosDollProfile } from "@/engine/battle/boss/profiles/chaosDollProfile";
import { echoHunterProfile } from "@/engine/battle/boss/profiles/echoHunterProfile";
import { corruptedCrownSaintProfile } from "@/engine/battle/boss/profiles/corruptedCrownSaintProfile";
import { eternalFrostBeastProfile } from "@/engine/battle/boss/profiles/eternalFrostBeastProfile";
import { moltenCoreSerpentProfile } from "@/engine/battle/boss/profiles/moltenCoreSerpentProfile";
import {
  hasBossProfile,
  registerBossProfile,
  type BossProfile,
} from "@/engine/battle/boss/bossRegistry";

const PROFILE_DEFINITIONS = [
  moltenCoreSerpentProfile,
  eternalFrostBeastProfile,
  corruptedCrownSaintProfile,
  echoHunterProfile,
  chaosDollProfile,
  { id: "hidden-magical-girls", actorEnemyIds: ["107", "108"], initialPhase: "trial" },
] as const;

function createProfile(
  definition: (typeof PROFILE_DEFINITIONS)[number],
): BossProfile {
  if ("reduceEvent" in definition) return definition;
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
