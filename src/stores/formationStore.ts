import { useSessionStore } from "@/stores/sessionStore";

export interface InPartyCharacter {
  id: string;
  displayName: string;
  isVanguard: boolean;
  isPlayer: boolean;
}

export function useFormationStore() {
  const sessionStore = useSessionStore();

  const PROTAGONIST_ID = "__player__";

  async function getFormation(): Promise<{
    vanguard: string[];
    reserve: string[];
  }> {
    const vars = await sessionStore.getVariableSnapshot();
    if (!vars?.root) return { vanguard: [PROTAGONIST_ID], reserve: [] };

    const vanguard: string[] = [PROTAGONIST_ID];
    const reserve: string[] = [];

    if (vars.root.characters) {
      for (const [charId, charData] of Object.entries(vars.root.characters)) {
        if (!charData.inParty) continue;
        if (charData.isVanguard) {
          vanguard.push(charId);
        } else {
          reserve.push(charId);
        }
      }
    }

    return { vanguard, reserve };
  }

  async function openFormationModal(): Promise<InPartyCharacter[]> {
    const vars = await sessionStore.getVariableSnapshot();
    if (!vars?.root) return [];

    const playerName = vars.root.player.profile.name || "主角";
    const result: InPartyCharacter[] = [
      {
        id: PROTAGONIST_ID,
        displayName: playerName,
        isVanguard: true,
        isPlayer: true,
      },
    ];

    if (vars.root.characters) {
      for (const [charId, charData] of Object.entries(vars.root.characters)) {
        if (!charData.inParty) continue;
        result.push({
          id: charId,
          displayName: charData.displayName,
          isVanguard: charData.isVanguard ?? false,
          isPlayer: false,
        });
      }
    }

    // Sort: protagonist first, then vanguard, then reserve
    result.sort((a, b) => {
      if (a.isPlayer) return -1;
      if (b.isPlayer) return 1;
      if (a.isVanguard && !b.isVanguard) return -1;
      if (!a.isVanguard && b.isVanguard) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    return result;
  }

  async function saveFormation(
    vanguardIds: string[],
    reserveIds: string[],
  ): Promise<void> {
    const vars = await sessionStore.getVariableSnapshot();
    if (!vars?.root?.characters) return;

    const patches = [];
    const allIds = new Set([...vanguardIds, ...reserveIds]);

    for (const charId of Object.keys(vars.root.characters)) {
      // Skip protagonist — not a character entry
      if (charId === PROTAGONIST_ID) continue;
      if (allIds.has(charId)) {
        patches.push({
          path: `characters.${charId}.isVanguard`,
          value: vanguardIds.includes(charId),
        });
      }
    }

    if (patches.length === 0) return;
    await sessionStore.patchVariables(patches, "formation-save");
  }

  return { getFormation, openFormationModal, saveFormation };
}
