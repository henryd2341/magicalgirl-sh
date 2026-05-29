import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

describe("world_info persistence", () => {
  it("stores and lists world info entries through the DB worker protocol", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbWorldInfoRepository(client);

    await repository.save({
      id: "wi-rooftop",
      keywords: ["天台", "影魔"],
      content: "黄昏后的天台容易出现影魔。",
      priority: 80,
      enabled: true,
      isConstant: true,
    });

    expect(await repository.list()).toEqual([
      {
        id: "wi-rooftop",
        keywords: ["天台", "影魔"],
        content: "黄昏后的天台容易出现影魔。",
        priority: 80,
        enabled: true,
        isConstant: true,
      },
    ]);
  });

  it("persists world info entries in sqlite across worker runtime instances", async () => {
    const sqlite3Factory = (await import("../../helpers/sharedRawSqlite"))
      .createSharedRawSqliteFactory();
    const firstClient = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(
        createDbWorkerRuntime({
          storage: "opfs-preferred",
          sqlite3Factory,
        }),
      ),
    );
    await firstClient.initialize();
    await new DbWorldInfoRepository(firstClient).save({
      id: "wi-constant-worldview",
      keywords: ["弓川市"],
      content: "弓川市是虫洞异常频发的沿海都市。",
      priority: 100,
      enabled: true,
      isConstant: true,
    });

    const secondClient = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(
        createDbWorkerRuntime({
          storage: "opfs-preferred",
          sqlite3Factory,
        }),
      ),
    );
    await secondClient.initialize();

    await expect(new DbWorldInfoRepository(secondClient).list()).resolves.toEqual([
      {
        id: "wi-constant-worldview",
        keywords: ["弓川市"],
        content: "弓川市是虫洞异常频发的沿海都市。",
        priority: 100,
        enabled: true,
        isConstant: true,
      },
    ]);
  });

  it("matches non-constant entries only by keyword, not by body text content", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbWorldInfoRepository(client);

    // Keyword "后勤" does NOT appear in search text "请介绍星偶。"
    // Content contains "星偶" which is in the search text — but
    // non-constant entries should only match via keyword, not body text.
    await repository.save({
      id: "wi-mascot-body",
      keywords: ["后勤"],
      content: "星偶负责通讯、传送与后勤支援。",
      priority: 70,
      enabled: true,
      isConstant: false,
    });
    await repository.save({
      id: "wi-disabled-body",
      keywords: ["星偶"],
      content: "禁用星偶条目不能进入请求。",
      priority: 100,
      enabled: false,
      isConstant: false,
    });
    await repository.save({
      id: "wi-constant",
      keywords: ["世界观"],
      content: "弓川市是沿海都市。",
      priority: 90,
      enabled: true,
      isConstant: true,
    });

    const result = await repository.search("请介绍星偶。");

    expect(result.constantEntries).toEqual([
      expect.objectContaining({ id: "wi-constant" }),
    ]);
    // No non-constant entry has its keyword in the search text.
    expect(result.matchedEntries).toEqual([]);
    expect(result.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "wi-mascot-body",
        included: false,
        reason: "no_keyword_match",
      }),
    );
    expect(result.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "wi-disabled-body",
        included: false,
        reason: "disabled",
      }),
    );
  });

  it("triggers non-constant entry when keyword is present in search text", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbWorldInfoRepository(client);

    await repository.save({
      id: "wi-hero",
      keywords: ["弓川", "女子学院"],
      content: "弓川女子学院魔法少女档案。",
      priority: 70,
      enabled: true,
      isConstant: false,
    });

    const result = await repository.search("弓川市的女子学院今天开学。");

    expect(result.matchedEntries).toEqual([
      expect.objectContaining({ id: "wi-hero" }),
    ]);
    expect(result.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "wi-hero",
        included: true,
        reason: "keyword_match",
      }),
    );
  });

  it("does not trigger non-constant entry when only content shares vocabulary with search text", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbWorldInfoRepository(client);

    // Keyword is "变身" but content contains "弓川市" and "女子学院".
    // Search text contains "弓川市" and "女子学院" but NOT "变身".
    await repository.save({
      id: "wi-shared-vocab",
      keywords: ["变身"],
      content: "弓川市女子学院的魔法少女在变身时会发光。",
      priority: 70,
      enabled: true,
      isConstant: false,
    });

    const result = await repository.search("弓川市的女子学院今天开学。");

    expect(result.matchedEntries).toEqual([]);
    expect(result.traces).toContainEqual(
      expect.objectContaining({
        sourceId: "wi-shared-vocab",
        included: false,
        reason: "no_keyword_match",
      }),
    );
  });

  it("constant entries are always included regardless of keyword match", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbWorldInfoRepository(client);

    await repository.save({
      id: "wi-constant-no-keyword",
      keywords: ["世界观"],
      content: "弓川市是沿海都市。",
      priority: 90,
      enabled: true,
      isConstant: true,
    });

    const result = await repository.search("今天天气真好。");

    expect(result.constantEntries).toEqual([
      expect.objectContaining({ id: "wi-constant-no-keyword" }),
    ]);
    expect(result.matchedEntries).toEqual([]);
  });

  it("updates world info metadata used by prompt builder controls", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbWorldInfoRepository(client);

    await repository.save({
      id: "wi-editable",
      keywords: ["旧关键词"],
      content: "正文不可由 Prompt Builder 编辑。",
      priority: 10,
      enabled: true,
      isConstant: false,
    });
    await repository.save({
      id: "wi-editable",
      keywords: ["新关键词", "别名"],
      content: "正文不可由 Prompt Builder 编辑。",
      priority: 120,
      enabled: true,
      isConstant: true,
    });

    await expect(repository.list()).resolves.toEqual([
      {
        id: "wi-editable",
        keywords: ["新关键词", "别名"],
        content: "正文不可由 Prompt Builder 编辑。",
        priority: 120,
        enabled: true,
        isConstant: true,
      },
    ]);
  });
});
