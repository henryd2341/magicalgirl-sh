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
    });

    expect(await repository.list()).toEqual([
      {
        id: "wi-rooftop",
        keywords: ["天台", "影魔"],
        content: "黄昏后的天台容易出现影魔。",
        priority: 80,
        enabled: true,
      },
    ]);
  });
});
