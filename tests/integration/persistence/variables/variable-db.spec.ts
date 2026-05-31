import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import {
  DbVariableChangeLogRepository,
  DbVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

describe("DbVariableRepository", () => {
  it("persists the current root tree snapshot into the db worker and reads it back", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();

    const repository = new DbVariableRepository(client);

    await repository.saveCurrent({
      rootId: "game_variables_root",
      version: 2,
      stateHash: "hash-v2",
      updatedAt: "2026-05-22T00:00:00.000Z",
      root: {
        schemaVersion: "4.0.0",
        world: {
          time: {
            displayText: "9月15日 周二 上午",
            dayIndex: 1,
            timeSlot: "上午",
          },
          location: {
            id: "school_rooftop",
            name: "天台",
            description: "风很大，护栏冰凉。",
          },
          affairs: {
            rooftop_encounter: {
              title: "天台相遇",
              description: "去天台与神秘少女见面。",
              status: "进行中",
            },
          },
          flags: {
            prologue_started: true,
          },
        },
        player: {
          profile: {
            name: "Hibiki",
            age: 16,
            gender: "女",
          },
          combat: {
            level: 1,
            exp: 0,
            hp: {
              current: 20,
              max: 20,
            },
            mp: {
              current: 10,
              max: 10,
            },
            attack: 5,
            defense: 4,
            agility: 6,
            intelligence: 7,
            allocatedPoints: {
              attack: 0,
              defense: 0,
              agility: 0,
              intelligence: 0,
            },
            unspentPoints: 0,
          },
          money: 120,
          equipment: {
            accessory: null,
          },
          relationships: {
            kazusa: 2,
          },
          flags: {
            met_rooftop_girl: true,
          },
        },
        characters: {
          kazusa: {
            displayName: "霞",
            identity: "柚木女子学院学生",
            relationshipTag: "观察对象",
            awakeningStatus: "未知",
            currentState: "在天台",
            combat: null,
            flags: {
              first_seen: true,
            },
          },
        },
        inventory: {
          items: {
            potion: 3,
          },
          battleItems: {
            potion: 2,
          },
        },
      },
    });

    expect(await repository.getCurrent()).toEqual(
      expect.objectContaining({
        version: 2,
        stateHash: "hash-v2",
        root: expect.objectContaining({
          world: expect.objectContaining({
            location: expect.objectContaining({
              name: "天台",
            }),
          }),
          inventory: {
            items: {
              potion: 3,
            },
            battleItems: {
              potion: 2,
            },
          },
        }),
      }),
    );
  });

  it("records committed variable change logs with request and tool metadata", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();

    const repository = new DbVariableChangeLogRepository(client);

    await repository.append({
      id: "change-001",
      rootId: "game_variables_root",
      requestId: "req-change-001",
      toolCallId: "tool-change-001",
      contextVersion: 3,
      stateHashBefore: "hash-before",
      stateHashAfter: "hash-after",
      patches: [
        {
          path: "player.money",
          value: 50,
        },
      ],
      createdAt: "2026-05-22T00:00:01.000Z",
    });

    expect(await repository.list()).toEqual([
      expect.objectContaining({
        requestId: "req-change-001",
        toolCallId: "tool-change-001",
        stateHashBefore: "hash-before",
        stateHashAfter: "hash-after",
      }),
    ]);
  });
});
