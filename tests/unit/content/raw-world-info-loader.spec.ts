import {
  buildRawWorldInfoEntries,
  RAW_WORLD_INFO_CONSTANT_IDS,
  syncRawWorldInfoEntries,
} from "@/content/rawWorldInfoLoader";
import { InMemoryWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { describe, expect, it } from "vitest";

describe("raw world info loader", () => {
  it("builds deterministic world info entries from raw entry modules", () => {
    const entries = buildRawWorldInfoEntries({
      "../../raw_entries/M.A.S.C.O.T.txt": "<MASCOT>\n星偶基础资料。",
      "../../raw_entries/角色速览.txt": "{{user}}\n青井霞\n国津燕",
      "../../raw_entries/世界观基础.txt": "<worldview>\n弓川市与虫洞异常。",
      "../../raw_entries/青井霞.txt": "<青井霞_Information>\n青井霞角色档案。",
    });

    expect(entries).toEqual([
      expect.objectContaining({
        id: "raw_entries/世界观基础",
        keywords: expect.arrayContaining(["世界观基础", "worldview"]),
        content: "<worldview>\n弓川市与虫洞异常。",
        priority: 1000,
        enabled: true,
        isConstant: true,
      }),
      expect.objectContaining({
        id: "raw_entries/角色速览",
        keywords: expect.arrayContaining(["角色速览"]),
        content: "{{user}}\n青井霞\n国津燕",
        priority: 995,
        enabled: true,
        isConstant: true,
      }),
      expect.objectContaining({
        id: "raw_entries/M.A.S.C.O.T",
        keywords: expect.arrayContaining(["M.A.S.C.O.T", "MASCOT"]),
        content: "<MASCOT>\n星偶基础资料。",
        priority: 990,
        enabled: true,
        isConstant: true,
      }),
      expect.objectContaining({
        id: "raw_entries/青井霞",
        keywords: expect.arrayContaining(["青井霞", "青井霞_Information"]),
        content: "<青井霞_Information>\n青井霞角色档案。",
        priority: 500,
        enabled: true,
        isConstant: false,
      }),
    ]);
    expect(RAW_WORLD_INFO_CONSTANT_IDS).toEqual([
      "raw_entries/世界观基础",
      "raw_entries/角色速览",
      "raw_entries/M.A.S.C.O.T",
    ]);
  });

  it("syncs bundled raw entries while preserving editable metadata", async () => {
    const repository = new InMemoryWorldInfoRepository();
    await repository.save({
      id: "raw_entries/M.A.S.C.O.T",
      keywords: ["星偶", "自定义关键词"],
      content: "旧正文。",
      priority: 123,
      enabled: true,
      isConstant: false,
    });

    const synced = await syncRawWorldInfoEntries(repository, {
      "../../raw_entries/M.A.S.C.O.T.txt": "<MASCOT>\n新正文。",
      "../../raw_entries/世界观基础.txt": "<worldview>\n弓川市与虫洞异常。",
    });

    expect(synced).toEqual([
      expect.objectContaining({
        id: "raw_entries/世界观基础",
        content: "<worldview>\n弓川市与虫洞异常。",
        priority: 1000,
        isConstant: true,
      }),
      expect.objectContaining({
        id: "raw_entries/M.A.S.C.O.T",
        keywords: ["星偶", "自定义关键词"],
        content: "<MASCOT>\n新正文。",
        priority: 123,
        isConstant: false,
      }),
    ]);
  });
});
