import { buildToolFoldHtml } from "@/orchestrator/toolResults";
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { fireEvent, render, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import * as markdown from '@/composables/useMarkdown';
import { renderMessageBody } from '@/ui/chat/messagePresentation';
import ChatMessageList from '@/ui/chat/ChatMessageList.vue';
import { useChatStore } from '@/stores/chatStore';
import { useGameDialog } from '@/composables/useGameDialog';
import type { ChatMessage } from '@/types/chat';

const message = (id: string, content: string): ChatMessage => ({
  id,
  content,
  role: 'assistant',
  kind: 'normal',
  user_visible: true,
  ai_visible: true,
  provisional: false,
  finalized: true,
  failed: false,
  created_at: 'same timestamp',
});

describe('conversation presentation', () => {
  it.each(['user', 'assistant', 'system'] as const)('restores the original role/status stickers for %s', role => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const states = [
      { failed: true, provisional: false, finalized: false, label: '失败草稿' },
      { failed: false, provisional: true, finalized: false, label: '生成中' },
      { failed: false, provisional: false, finalized: true, label: '已确认' },
      { failed: false, provisional: false, finalized: false, label: '待处理' },
    ];
    const view = render(ChatMessageList, {
      props: { messages: states.map((state, index) => ({ ...message(String(index), '正文'), ...state, role })) },
      global: { plugins: [pinia] },
    });
    expect(view.container.querySelector("#chat-message-list")).toHaveClass("chat-message-list", "mg-panel");
    for (const [index, state] of states.entries()) {
      const meta = view.container.querySelector(`#chat-message-${index} .chat-message-card__meta`)!;
      expect(meta.querySelector('.mg-sticker--pink')).toHaveClass('mg-sticker');
      expect(meta.querySelector('.mg-sticker--pink')).toHaveTextContent(
        role === 'user' ? '玩家' : role === 'assistant' ? '叙事 AI' : '系统',
      );
      const status = meta.querySelector('.mg-sticker--dark');
      expect(status).toHaveClass('mg-sticker');
      expect(status).toHaveTextContent(state.label);
      expect(status).toHaveAttribute('data-tone', state.failed ? 'warning' : 'info');
    }
  });

  it('has no conversation search controls even in virtual mode', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    render(ChatMessageList, { props: { messages: [], virtual: true }, global: { plugins: [pinia] } });
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查找记录' })).not.toBeInTheDocument();
  });

  it('keeps imported prototype-like ids safe and cancels a same-id replacement draft', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const original = { ...message('__proto__', '原文'), reasoning: '历史思考' };
    const view = render(ChatMessageList, {
      props: { messages: [original], historyEpoch: 0 },
      global: { plugins: [pinia] },
    });
    const toggle = screen.getByRole('button', { name: /思考过程/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await fireEvent.click(screen.getByRole('button', { name: '编辑消息' }));
    await fireEvent.update(screen.getByRole('textbox', { name: '编辑消息内容' }), '未保存草稿');
    await view.rerender({ messages: [{ ...original, content: '恢复正文' }], historyEpoch: 1 });
    expect(screen.queryByRole('textbox', { name: '编辑消息内容' })).not.toBeInTheDocument();
    expect(screen.getByText('恢复正文')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
  it.each(['<think>secret</think>正文', '正文<think>secret', 'secret</think>正文'])(
    'preserves custom thought form %s',
    content => {
      expect(renderMessageBody(content, 'assistant', 'think')).toContain('secret');
      expect(renderMessageBody(content, 'assistant', 'think')).toContain('正文');
      expect(renderMessageBody(content, 'assistant', 'think')).toContain('class="cot-fold"');
    },
  );

  it('isolates body parsing, lets active reasoning collapse, copies raw text and edits by id', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.resetToInMemoryPersistence();
    const first = { ...message('first', '**原始**'), reasoning: '思考', provisional: true };
    const second = message('second', '编辑前');
    await store.getActiveChatRuntime().repository.replaceAll([first, second]);
    await store.refreshMessages();
    const spy = vi.spyOn(markdown, 'renderMarkdown');
    const view = render(ChatMessageList, { props: { messages: store.messages }, global: { plugins: [pinia] } });
    expect(spy).toHaveBeenCalledTimes(2);
    await fireEvent.click(screen.getByRole('button', { name: /思考过程/ }));
    expect(screen.getByRole('button', { name: /思考过程/ })).toHaveAttribute('aria-expanded', 'false');
    expect(spy).toHaveBeenCalledTimes(2);
    await view.rerender({ messages: [{ ...first, reasoning: '增加的思考' }, second] });
    expect(spy).toHaveBeenCalledTimes(2);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await fireEvent.click(screen.getAllByRole('button', { name: '复制消息原始内容' })[0]);
    expect(writeText).toHaveBeenCalledWith('**原始**');
    await fireEvent.click(screen.getAllByRole('button', { name: '编辑消息' })[1]);
    await fireEvent.update(screen.getByRole('textbox', { name: '编辑消息内容' }), '  保存正文  ');
    await fireEvent.keyDown(screen.getByRole('textbox', { name: '编辑消息内容' }), { key: 'Enter', ctrlKey: true });
    await vi.waitFor(() => expect(store.messages.find(m => m.id === 'second')?.content).toBe('保存正文'));
    expect(store.messages[0].content).toBe('**原始**');
    spy.mockRestore();
  });

  it('requires retry confirmation and emits the original id', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const view = render(ChatMessageList, {
      props: { messages: [message('old-id', '正文')] },
      global: { plugins: [pinia] },
    });
    await fireEvent.click(screen.getByRole('button', { name: '重新生成' }));
    expect(view.emitted().retry).toBeUndefined();
    useGameDialog().handleCancel();
    await nextTick();
    expect(view.emitted().retry).toBeUndefined();
    await fireEvent.click(screen.getByRole('button', { name: '重新生成' }));
    useGameDialog().handleConfirm();
    await nextTick();
    expect(view.emitted().retry).toEqual([['old-id']]);
  });
  it('keeps legacy and new per-call tool disclosures independently expandable through body updates', async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    const patches = [{ path: 'one', value: 0 }, { path: 'two', value: false }, { path: 'three', value: { full: [1, 2, 3] } }, { path: 'one', value: 4 }];
    const skillName = '夜行'.repeat(100);
    const skillContent = '技能的完整返回内容'.repeat(100);
    const raw = '<details class="chat-tool-fold"><summary>旧工具调用</summary>历史已执行</details>' + buildToolFoldHtml([
      { tool_name: 'update_variables', tool_call_id: 'batch', ok: true, output: { patches } },
      { tool_name: 'read_skill', tool_call_id: 'skill', ok: true, output: { name: skillName, content: skillContent } },
    ]);
    const view = render(ChatMessageList, { props: { messages: [message('tools', raw)] }, global: { plugins: [pinia] } });
    await nextTick();
    await nextTick();
    const folds = view.container.querySelectorAll('details');
    expect(folds).toHaveLength(3);
    expect(folds[1]).toHaveClass('chat-tool-chip');
    expect(folds[2]).toHaveClass('chat-tool-chip');
    expect(folds[1].parentElement).toBe(folds[2].parentElement);
    expect(folds[1].open).toBe(false);
    await fireEvent.click(folds[1].querySelector('summary')!);
    expect(folds[1].open).toBe(true);
    await fireEvent(folds[1], new Event('toggle', { bubbles: false }));
    expect(JSON.parse(folds[1].querySelector('code')!.textContent!).output.patches).toEqual(patches);
    expect(folds[2].open).toBe(false);
    expect(folds[2].querySelector('summary')).toHaveTextContent(skillName);
    expect(JSON.parse(folds[2].querySelector('code')!.textContent!).output).toEqual({ name: skillName, content: skillContent });
    await view.rerender({ messages: [message('tools', raw + '\n后续正文')] });
    await nextTick();
    expect(view.container.querySelectorAll('details')[1].open).toBe(true);
    expect(view.container.querySelectorAll('details')[2].open).toBe(false);
    const restored = view.container.querySelectorAll('details');
    await fireEvent.click(restored[1].querySelector('summary')!);
    expect(restored[1].open).toBe(false);
    expect(restored[2].open).toBe(false);
    expect(view.container.querySelector('.chat-tool-fold')).toHaveTextContent('历史已执行');
  });

});
