import {
  createDefaultGameVariablesRoot,
  createDefaultTrainingProgress,
  getTrainingProgress,
} from '@/engine/variablePolicy';
import { TrainingSessionService } from '@/engine/training/trainingSessionService';
import type { BattleSnapshot, CreatePendingBattleSnapshotInput } from '@/types/battle';
import type { VariableValueRecord } from '@/types/variables';
import { describe, expect, it, vi } from 'vitest';
import { enabledTrainingCatalogFixture, enabledTrainingPuzzleFixture } from '../../helpers/trainingFixtures';

describe('training progress helpers', () => {
  it('creates empty training progress in a new game', () => {
    expect(createDefaultGameVariablesRoot().training).toEqual({
      clearedChallengeIds: [],
      claimedRewardIds: [],
      hiddenChallengeDiscovered: false,
    });
  });

  it('returns an empty default for a legacy root without mutating it', () => {
    const root = createDefaultGameVariablesRoot();
    delete root.training;
    expect(getTrainingProgress(root)).toEqual(createDefaultTrainingProgress());
    expect('training' in root).toBe(false);
  });

  it('creates fresh independent defaults', () => {
    const first = createDefaultTrainingProgress();
    const second = createDefaultTrainingProgress();
    first.clearedChallengeIds.push('challenge-1');
    first.claimedRewardIds.push('reward-1');
    expect(second).toEqual({ clearedChallengeIds: [], claimedRewardIds: [], hiddenChallengeDiscovered: false });
  });

  it('returns a defensive copy of persisted progress', () => {
    const root = createDefaultGameVariablesRoot();
    root.training = {
      clearedChallengeIds: ['challenge-1'],
      claimedRewardIds: ['reward-1'],
      hiddenChallengeDiscovered: true,
    };
    const progress = getTrainingProgress(root);
    progress.clearedChallengeIds.push('challenge-2');
    progress.claimedRewardIds.push('reward-2');
    expect(progress).not.toBe(root.training);
    expect(progress.clearedChallengeIds).not.toBe(root.training.clearedChallengeIds);
    expect(progress.claimedRewardIds).not.toBe(root.training.claimedRewardIds);
    expect(root.training).toEqual({
      clearedChallengeIds: ['challenge-1'],
      claimedRewardIds: ['reward-1'],
      hiddenChallengeDiscovered: true,
    });
  });
});
function makeRecord(): VariableValueRecord {
  const root = createDefaultGameVariablesRoot();
  root.player.money = 0;
  root.player.combat.level = 62;
  return { rootId: 'root', version: 3, stateHash: 'old', updatedAt: 'old', root };
}

function resolved(
  source: BattleSnapshot['source'],
  encounterId: string,
  outcome: 'victory' | 'defeat' | 'escape' = 'victory',
): BattleSnapshot {
  return {
    lifecycleState: 'RESOLVED',
    phase: 'RESULT',
    encounterId,
    source,
    participants: [],
    pressTurn: { ownerSide: 'player', icons: [] },
    battleResult: {
      outcome,
      endReason: outcome === 'victory' ? 'all_enemies_down' : outcome === 'defeat' ? 'all_players_down' : 'manual_exit',
      turnCount: 1,
      survivingParticipantIds: [],
      downParticipantIds: [],
    },
  };
}

function harness(initial = makeRecord()) {
  let current = initial;
  const staged: CreatePendingBattleSnapshotInput[] = [];
  const save = vi.fn(async (next: VariableValueRecord) => {
    current = next;
  });
  const service = new TrainingSessionService({
    catalog: structuredClone(enabledTrainingCatalogFixture),
    puzzle: structuredClone(enabledTrainingPuzzleFixture),
    getCurrent: async () => current,
    saveCurrent: save,
    stageEncounter: async input => {
      staged.push(input);
    },
    createNextRecord: (root, previous) => ({
      ...previous,
      version: previous.version + 1,
      stateHash: `hash-${previous.version + 1}`,
      updatedAt: 'next',
      root,
    }),
    digestAnswer: async answer => (answer === 'magic' ? '0'.repeat(64) : 'f'.repeat(64)),
  });
  return { service, staged, save, current: () => current };
}

describe('TrainingSessionService', () => {
  it('rejects reserved free enemies and stages collapsed valid selections', async () => {
    const { service, staged, save } = harness();
    await expect(service.beginFreeTraining(['1'])).rejects.toThrow('reserved');
    const result = await service.beginFreeTraining(['7', '7', '8']);
    expect(staged).toEqual([
      {
        encounterId: result.encounterId,
        narrativeReason: expect.any(String),
        enemies: [
          { enemy_id: '7', count: 2 },
          { enemy_id: '8', count: 1 },
        ],
        source: 'training/free',
      },
    ]);
    expect(result.encounterId).toMatch(/^training\/free\//);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects locked challenges and stages an unlocked challenge', async () => {
    const { service, staged, save } = harness();
    await expect(service.beginChallenge('trial-2')).rejects.toThrow('locked');
    const result = await service.beginChallenge('trial-1');
    expect(staged[0]).toEqual({
      encounterId: result.encounterId,
      narrativeReason: expect.any(String),
      enemies: [{ enemy_id: '1', count: 1 }],
      source: 'training/challenge',
    });
    expect(result.challengeId).toBe('trial-1');
    expect(save).not.toHaveBeenCalled();
  });

  it('persists one exact first-clear reward', async () => {
    const { service, save, current } = harness();
    const begun = await service.beginChallenge('trial-1');
    await expect(service.completeTrainingBattle(resolved('training/challenge', begun.encounterId))).resolves.toEqual({
      rewarded: true,
      challengeId: 'trial-1',
      reward: { money: 100, items: { '1': 1 } },
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(current().version).toBe(4);
    expect(current().root.player.money).toBe(100);
    expect(current().root.inventory.items['1']).toBe(1);
    expect(current().root.training).toEqual({
      clearedChallengeIds: ['trial-1'],
      claimedRewardIds: ['trial-1'],
      hiddenChallengeDiscovered: false,
    });
  });

  it('does not write duplicate, free, defeat, or escape results', async () => {
    const initial = makeRecord();
    initial.root.training = {
      clearedChallengeIds: ['trial-1'],
      claimedRewardIds: ['trial-1'],
      hiddenChallengeDiscovered: false,
    };
    const { service, save } = harness(initial);
    const challenge = await service.beginChallenge('trial-1');
    const free = await service.beginFreeTraining(['7']);
    await expect(
      service.completeTrainingBattle(resolved('training/challenge', challenge.encounterId)),
    ).resolves.toMatchObject({ rewarded: false, reason: 'already_claimed' });
    await expect(service.completeTrainingBattle(resolved('training/free', free.encounterId))).resolves.toMatchObject({
      rewarded: false,
      reason: 'free_training',
    });
    await expect(
      service.completeTrainingBattle(resolved('training/challenge', challenge.encounterId, 'defeat')),
    ).resolves.toMatchObject({ rewarded: false, reason: 'not_victory' });
    await expect(
      service.completeTrainingBattle(resolved('training/challenge', challenge.encounterId, 'escape')),
    ).resolves.toMatchObject({ rewarded: false, reason: 'not_victory' });
    expect(save).not.toHaveBeenCalled();
  });

  it('retries from repository state after a failed save', async () => {
    const initial = makeRecord();
    let current = initial;
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk'))
      .mockImplementationOnce(async (next: VariableValueRecord) => {
        current = next;
      });
    const service = new TrainingSessionService({
      catalog: enabledTrainingCatalogFixture,
      puzzle: enabledTrainingPuzzleFixture,
      getCurrent: async () => current,
      saveCurrent: save,
      stageEncounter: async () => {},
      createNextRecord: (root, previous) => ({ ...previous, version: previous.version + 1, stateHash: 'next', root }),
    });
    const begun = await service.beginChallenge('trial-1');
    await expect(service.completeTrainingBattle(resolved('training/challenge', begun.encounterId))).rejects.toThrow(
      'disk',
    );
    expect(current).toBe(initial);
    await expect(
      service.completeTrainingBattle(resolved('training/challenge', begun.encounterId)),
    ).resolves.toMatchObject({ rewarded: true });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('handles puzzle mismatch, discovery, and repeat idempotently', async () => {
    const initial = makeRecord();
    initial.root.training = {
      clearedChallengeIds: ['trial-1', 'trial-2', 'trial-3', 'trial-4', 'trial-5'],
      claimedRewardIds: [],
      hiddenChallengeDiscovered: false,
    };
    const { service, save, current } = harness(initial);
    await expect(service.submitPuzzleAnswer('wrong')).resolves.toEqual({ discovered: false, reason: 'mismatch' });
    expect(save).not.toHaveBeenCalled();
    await expect(service.submitPuzzleAnswer(' MAGIC ')).resolves.toEqual({
      discovered: true,
      alreadyDiscovered: false,
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(current().root.training?.hiddenChallengeDiscovered).toBe(true);
    await expect(service.submitPuzzleAnswer('magic')).resolves.toEqual({ discovered: true, alreadyDiscovered: true });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('aborts without writing and rejects story or unresolved snapshots', async () => {
    const { service, save } = harness();
    await expect(service.abortTrainingBattle(resolved('training/free', 'training/free/7'))).resolves.toEqual({
      aborted: true,
    });
    expect(save).not.toHaveBeenCalled();
    await expect(service.completeTrainingBattle(resolved('story', 'story'))).rejects.toThrow('training');
    await expect(service.abortTrainingBattle(resolved('story', 'story'))).rejects.toThrow('training');
    const active = {
      ...resolved('training/free', 'training/free/7'),
      lifecycleState: 'ACTIVE' as const,
      phase: 'PLAYER_COMMAND' as const,
      battleResult: undefined,
    };
    await expect(service.completeTrainingBattle(active)).rejects.toThrow('resolved');
  });
});
