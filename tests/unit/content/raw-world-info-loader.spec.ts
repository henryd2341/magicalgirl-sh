import {
  buildRawWorldInfoEntries,
  RAW_WORLD_INFO_CONSTANT_IDS,
} from "@/content/rawWorldInfoLoader";
import { describe, expect, it } from "vitest";

describe("raw world info loader", () => {
  it("builds deterministic world info entries from raw entry modules", () => {
    const entries = buildRawWorldInfoEntries({
      "../../raw_entries/M.A.S.C.O.T.txt": "<MASCOT>\n星偶基础资料。",
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
      "raw_entries/M.A.S.C.O.T",
    ]);
  });
});
