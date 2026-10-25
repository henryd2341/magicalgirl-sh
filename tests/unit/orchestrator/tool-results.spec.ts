import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/composables/useMarkdown';
import { buildToolFoldHtml, normalizeStepToolResults, readToolChipPatches } from '@/orchestrator/toolResults';
import { buildHarnessRequest } from '@/orchestrator/promptBuilder';
import { InMemoryChatHistoryRepository } from '@/persistence/repositories/chatHistoryRepository';
import { InMemoryVariableRepository } from '@/persistence/repositories/variableRepository';
import { InMemoryWorldInfoRepository } from '@/persistence/repositories/worldInfoRepository';
import { ChatMessageService } from '@/engine/chatMessageService';
import { GameEngineFacade } from '@/engine/gameEngineFacade';
import { createSessionManager } from '@/engine/sessionManager';
import { OrchestratorService } from '@/orchestrator/orchestratorService';
import { FakeStreamingProviderClient } from '@/orchestrator/providerClient';

const patches = [
  { path: 'a', value: 0 },
  { path: 'b', value: false },
  { path: 'c', value: '' },
  { path: 'd', value: null },
  { path: 'nested', value: { array: ['<&"\'`\n</details><script>alert(1)</script>', { complete: true }] } },
  { path: 'a', value: 42 },
];
const results = [
  {
    tool_name: 'update_variables',
    tool_call_id: 'batch',
    ok: true,
    output: { patches, next: { root: 'HIDDEN_ROOT' } },
  },
  {
    tool_name: 'read_skill',
    tool_call_id: 'skill',
    ok: true,
    output: { name: '技能<&', content: '完整技能\n</details><img src=x onerror=alert(1)>' },
  },
];

describe('recorded tool results', () => {
  it('renders uncapped sibling chips with literal complete values and no private root', () => {
    const raw = buildToolFoldHtml(results);
    const body = document.createElement('div');
    body.innerHTML = renderMarkdown(raw);
    expect(body.querySelectorAll('details')).toHaveLength(2);
    expect(body.querySelectorAll('details details')).toHaveLength(0);
    expect(body.querySelectorAll('script,img')).toHaveLength(0);
    expect(JSON.parse(body.querySelector('code')!.textContent!).output.patches).toEqual(patches);
    expect(readToolChipPatches(raw)).toEqual(patches);
    expect(body.querySelectorAll('summary')[0]).toHaveTextContent('变量更新 · 6 项 · 已完成');
    expect(body.querySelectorAll('summary')[1]).toHaveTextContent('读取技能 · 技能<&');
    expect(body.textContent).toContain('完整技能');
    expect(raw).not.toContain('HIDDEN_ROOT');
  });

  it('supports direct outputs, inner failures, missing results and explicit battle skips truthfully', () => {
    const normalized = normalizeStepToolResults({
      toolCalls: ['direct', 'failed', 'missing'].map(toolCallId => ({ toolCallId, toolName: 'read_skill' })),
      toolResults: [
        { toolCallId: 'direct', output: { name: 'direct', content: 'result' } },
        { toolCallId: 'failed', output: { ok: false, error: 'partial persistence failure' } },
      ],
    });
    expect(normalized.map(r => r.ok)).toEqual([true, false, false]);
    const html = renderMarkdown(
      buildToolFoldHtml([
        ...normalized,
        {
          tool_name: 'trigger_battle',
          tool_call_id: 'skip',
          ok: true,
          output: { accepted: false, reason: 'already continued' },
        },
      ]),
    );
    expect(html).toContain('未确认');
    expect(html).toContain('partial persistence failure');
    expect(html).toContain('已跳过');
    expect(html).not.toMatch(/已回滚|没有变更|无变更/);
  });

  it('extracts only three latest applied paths for prompts, preserves legacy and strips sibling tool content', async () => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new ChatMessageService(repository);
    await service.createAssistantProvisionalMessage({ id: 'old', requestId: 'old', createdAt: '2026-01-01' });
    await service.appendAssistantChunk({
      messageId: 'old',
      chunk:
        '<details class="chat-tool-fold"><summary>工具调用</summary>\n\n**变量更新**\n- `legacy` → "保留"\n\n</details>',
    });
    await service.finalizeAssistantMessage({ messageId: 'old', commitAck: true });
    const requestFor = () =>
      buildHarnessRequest({
        chatRepository: repository,
        variableRepository: new InMemoryVariableRepository(),
        worldInfoRepository: new InMemoryWorldInfoRepository(),
        systemPrompt: 'test',
        userInput: '继续',
        requestId: 'prompt',
        contextVersion: 1,
      });
    expect((await requestFor()).segments.find(s => s.id === 'recent_variable_updates')?.content).toContain(
      'legacy → "保留"',
    );
    await service.createAssistantProvisionalMessage({ id: 'new', requestId: 'new', createdAt: '2026-01-02' });
    await service.appendAssistantChunk({
      messageId: 'new',
      chunk:
        '正文' +
        buildToolFoldHtml(results) +
        buildToolFoldHtml([
          {
            tool_name: 'update_variables',
            tool_call_id: 'failed',
            ok: false,
            output: { patches: [{ path: 'failed', value: 99 }] },
            error: '**变量更新**\n- `failed` → 99',
          },
        ]),
    });
    await service.finalizeAssistantMessage({ messageId: 'new', commitAck: true });
    const request = await requestFor();
    const recent = request.segments.find(s => s.id === 'recent_variable_updates')!.content;
    expect(recent.split('\n').filter(line => line.startsWith('- '))).toHaveLength(3);
    expect(recent).toContain('a → 42');
    expect(recent).toContain('d → null');
    expect(recent).not.toContain('failed');
    expect(recent).not.toContain('legacy');
    const history = request.messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .join('');
    expect(history).toBe('正文');
    expect(history).not.toContain('完整技能');
  });

  it.each([false, true])(
    'persists complete result chips before finalization or failed-draft recovery (retry=%s)',
    async retry => {
      for (const failed of [false, true]) {
        const repository = new InMemoryChatHistoryRepository();
        const chatService = new ChatMessageService(repository);
        const service = new OrchestratorService({
          chatService,
          gameEngineFacade: new GameEngineFacade(createSessionManager()),
          providerClient: new FakeStreamingProviderClient({
            textChunks: ['正文'],
            toolResults: [
              ...results,
              ...(failed ? [{ tool_name: 'read_skill', tool_call_id: 'failed', ok: false, error: '技能不存在' }] : []),
            ],
          }),
          buildRequest: async () => ({
            metadata: { request_id: 'request', context_version: 1, state_hash: 'initial', issued_at: 'now' },
            segments: [],
            traces: [],
            messages: [],
            tools: [],
            promptText: '',
          }),
          idFactory: { assistantMessageId: () => 'assistant', userMessageId: () => 'user' },
        });
        const outcome = retry
          ? await service.retryUserTurn({ userContent: '继续' })
          : await service.runUserTurn({ userInput: '继续' });
        const saved = (await repository.getById('assistant'))!;
        expect(outcome.ok).toBe(!failed);
        expect(saved.failed).toBe(failed);
        expect(saved.finalized).toBe(!failed);
        expect(readToolChipPatches(saved.content)).toEqual(patches);
        expect(saved.content).toContain('完整技能');
        if (failed) expect(saved.content).toContain('技能不存在');
      }
    },
  );
});
