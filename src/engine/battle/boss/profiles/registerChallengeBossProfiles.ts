import { hiddenMagicalGirlsProfile } from "@/engine/battle/boss/profiles/hiddenMagicalGirlsProfile";
import { chaosDollProfile } from "@/engine/battle/boss/profiles/chaosDollProfile";
import { echoHunterProfile } from "@/engine/battle/boss/profiles/echoHunterProfile";
import { corruptedCrownSaintProfile } from "@/engine/battle/boss/profiles/corruptedCrownSaintProfile";
import { eternalFrostBeastProfile } from "@/engine/battle/boss/profiles/eternalFrostBeastProfile";
import { moltenCoreSerpentProfile } from "@/engine/battle/boss/profiles/moltenCoreSerpentProfile";
import {
  hasBossProfile,
  registerBossProfile,
} from "@/engine/battle/boss/bossRegistry";

const PROFILE_DEFINITIONS = [
  moltenCoreSerpentProfile,
  eternalFrostBeastProfile,
  corruptedCrownSaintProfile,
  echoHunterProfile,
  chaosDollProfile,
  hiddenMagicalGirlsProfile,
] as const;

export function registerChallengeBossProfiles(): void {
  for (const definition of PROFILE_DEFINITIONS) {
    if (!hasBossProfile(definition.id)) {
      registerBossProfile(definition);
    }
  }
}
