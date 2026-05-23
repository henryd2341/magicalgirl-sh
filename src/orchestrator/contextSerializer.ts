import type { VariableValueRecord } from "@/types/variables";

function formatRecordItems(items: Record<string, number>): string[] {
  const entries = Object.entries(items);
  if (entries.length === 0) {
    return ["    无: 0"];
  }

  return entries.map(([name, count]) => `    ${name}: ${count}`);
}

export function serializeVariableSnapshot(record: VariableValueRecord): string {
  const root = record.root;
  const player = root.player;
  const combat = player.combat;

  return [
    "游戏状态快照:",
    `  角色名称: ${player.profile.name || "未命名"}`,
    `  等级: ${combat.level}`,
    `  HP: ${combat.hp.current}/${combat.hp.max}`,
    `  MP: ${combat.mp.current}/${combat.mp.max}`,
    `  金钱: ${player.money}`,
    `  当前时间: ${root.world.time.displayText}`,
    `  当前地点: ${root.world.location.name}`,
    "  背包:",
    ...formatRecordItems(root.inventory.items),
  ].join("\n");
}
