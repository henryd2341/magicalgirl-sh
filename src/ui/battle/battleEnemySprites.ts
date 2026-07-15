import challengeBoss100 from "@/assets/sprites/challenge-boss-100.png";
import challengeBoss101 from "@/assets/sprites/challenge-boss-101.png";
import challengeBoss102 from "@/assets/sprites/challenge-boss-102.png";
import challengeBoss103 from "@/assets/sprites/challenge-boss-103.png";
import challengeBoss104 from "@/assets/sprites/challenge-boss-104.png";
import challengeBoss105 from "@/assets/sprites/challenge-boss-105.png";
import challengeBoss106 from "@/assets/sprites/challenge-boss-106.png";
import challengeBoss107 from "@/assets/sprites/challenge-boss-107.png";
import challengeBoss108 from "@/assets/sprites/challenge-boss-108.png";

const CHALLENGE_BOSS_SPRITES: Readonly<Record<string, string>> = {
  "100": challengeBoss100,
  "101": challengeBoss101,
  "102": challengeBoss102,
  "103": challengeBoss103,
  "104": challengeBoss104,
  "105": challengeBoss105,
  "106": challengeBoss106,
  "107": challengeBoss107,
  "108": challengeBoss108,
};

export function getChallengeBossSprite(enemyId: string | undefined): string {
  return enemyId == null ? "" : CHALLENGE_BOSS_SPRITES[enemyId] ?? "";
}
