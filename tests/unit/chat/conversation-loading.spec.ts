import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { render, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import ConversationLoading from '@/ui/chat/ConversationLoading.vue';
import ChatMessageList from '@/ui/chat/ChatMessageList.vue';
import * as markdown from '@/composables/useMarkdown';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { DbWorkerClient, createInProcessDbWorkerEndpoint } from '@/persistence/dbClient';
import { configureChatPersistenceClient, resetChatPersistenceClient } from '@/persistence/chatRuntime';
import { DbRuntimeSnapshotRepository } from '@/persistence/repositories/runtimeSnapshotRepository';
import { createDbWorkerRuntime } from '@/workers/db.worker';

const pending = vi.hoisted(() => ({ wait: Promise.resolve(), error: '' }));
vi.mock('@/orchestrator/providerSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/orchestrator/providerSettings')>()),
  createConfiguredProviderClient: vi.fn(async () => {
    await pending.wait;
    if (pending.error === 'config') throw new Error('provider configuration failed');
    return {
      client: {
        stream: async () => {
          if (pending.error === 'stream') throw new Error('provider stream failed');
          return { finishReason: 'stop', toolResults: [] };
        },
      },
      providerInfo: { mode: 'fake', providerName: 'timer-test', hasApiKey: false },
    };
  }),
}));
function defer() {
  let resolve!: () => void;
  pending.wait = new Promise<void>(done => {
    resolve = done;
  });
  return resolve;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
  setActivePinia(createPinia());
  pending.wait = Promise.resolve();
  pending.error = '';
});
afterEach(() => {
  vi.useRealTimers();
  resetChatPersistenceClient();
  vi.restoreAllMocks();
});

describe('actual request elapsed time', () => {
  it('ticks independently of historical Markdown, survives remount and cleans up', async () => {
    const chat = useChatStore();
    await chat.createUserMessage({ id: 'history', content: '**历史**', createdAt: 'now' });
    const session = useSessionStore();
    session.storyTurnStartedAt = Date.now();
    const spy = vi.spyOn(markdown, 'renderMarkdown');
    const Host = defineComponent({
      setup: () => () =>
        h('div', [
          h(ChatMessageList, { messages: chat.messages }),
          h(ConversationLoading, { startedAt: session.storyTurnStartedAt }),
        ]),
    });
    const view = render(Host);
    expect(screen.getByText('已用时 00:00')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(12000);
    expect(screen.getByText('已用时 00:12')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('正在生成回复');
    expect(screen.getByRole('status')).not.toHaveTextContent('00:12');
    expect(spy).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    const second = render(ConversationLoading, { props: { startedAt: session.storyTurnStartedAt } });
    expect(screen.getByText('已用时 00:12')).toBeInTheDocument();
    await second.rerender({ startedAt: null });
    expect(screen.queryByText(/已用时/)).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['', 'config', 'stream'])(
    'starts before provisional messages and clears on completion/error=%s',
    async error => {
      const session = useSessionStore();
      const chat = useChatStore();
      const release = defer();
      pending.error = error;
      const operation = session.runStoryTurn('继续');
      const observed = operation.catch(cause => cause);
      expect(session.storyTurnStartedAt).toBe(Date.now());
      expect(session.isStoryTurnRunning).toBe(true);
      expect(chat.messages).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(3000);
      expect(session.storyTurnStartedAt).toBe(Date.now() - 3000);
      release();
      const result = await observed;
      if (error === 'config') expect(result).toBeInstanceOf(Error);
      else expect(result.ok).toBe(error !== 'stream');
      expect(session.isStoryTurnRunning).toBe(false);
      expect(session.storyTurnStartedAt).toBeNull();
    },
  );

  it.each(['assistant', 'user', 'post-combat'])('keeps one request timestamp through %s continuation', async route => {
    const client = new DbWorkerClient(createInProcessDbWorkerEndpoint(createDbWorkerRuntime()));
    await client.initialize();
    configureChatPersistenceClient(client);
    if (route === 'post-combat')
      await new DbRuntimeSnapshotRepository(client).saveCurrent({
        id: 'current',
        updatedAt: 'now',
        sessionSnapshot: { sessionState: 'POST_COMBAT_READY', pipelineState: null, activeRequestId: null },
        pendingBattle: null,
        activeBattle: null,
      });
    const chat = useChatStore();
    const session = useSessionStore();
    await chat.configurePersistence({ client });
    await session.configurePersistence({ client });
    if (route !== 'post-combat') await session.runStoryTurn('第一回合');
    await vi.advanceTimersByTimeAsync(10);
    const release = defer();
    const id = chat.messages.find(message => message.role === route)?.id;
    const operation = route === 'post-combat' ? session.continuePostCombatStory() : session.retryFromMessage(id!);
    const startedAt = session.storyTurnStartedAt;
    expect(startedAt).toBe(Date.now());
    await vi.advanceTimersByTimeAsync(4000);
    expect(session.storyTurnStartedAt).toBe(startedAt);
    expect(session.isStoryTurnRunning).toBe(true);
    release();
    await operation;
    await nextTick();
    expect(session.storyTurnStartedAt).toBeNull();
    expect(session.isStoryTurnRunning).toBe(false);
  });
});
