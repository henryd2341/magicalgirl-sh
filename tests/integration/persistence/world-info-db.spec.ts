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
});
