import type { ProviderToolResult } from '@/orchestrator/providerClient';
import type { VariablePathPatch } from '@/types/variables';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof record(error).message === 'string'
      ? String(record(error).message)
      : String(error);
}

export function normalizeStepToolResults(step: {
  toolCalls: ReadonlyArray<{ toolName: string; toolCallId: string; input?: unknown; error?: unknown }>;
  toolResults: ReadonlyArray<{ toolCallId: string; output?: unknown; error?: unknown }>;
  content?: ReadonlyArray<unknown>;
}): ProviderToolResult[] {
  return step.toolCalls.map(call => {
    const result = step.toolResults.find(result => result.toolCallId === call.toolCallId);
    const failure = step.content
      ?.map(record)
      .find(part => part.type === 'tool-error' && part.toolCallId === call.toolCallId);
    const base = { tool_name: call.toolName, tool_call_id: call.toolCallId, input: call.input };
    if (failure || call.error !== undefined || (result && 'error' in result)) {
      return { ...base, ok: false, error: errorText(failure?.error ?? call.error ?? result?.error) };
    }
    if (!result) return { ...base, ok: false, unconfirmed: true, error: '未收到工具执行结果，状态未确认。' };
    const envelope = record(result.output);
    const wrapped = envelope.tool_name === call.toolName && typeof envelope.ok === 'boolean';
    const output = wrapped
      ? call.toolName === 'read_skill'
        ? { name: envelope.name, content: envelope.content }
        : envelope.output
      : result.output;
    const domain = record(output);
    const ok = envelope.ok !== false && domain.ok !== false;
    return {
      ...base,
      ok,
      output,
      ...(!ok ? { error: errorText(envelope.error ?? domain.error ?? '工具执行失败。') } : {}),
    };
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function patchesFrom(value: unknown): VariablePathPatch[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every(p => typeof record(p).path === 'string' && Object.hasOwn(record(p), 'value'))
  )
    return;
  return value as VariablePathPatch[];
}

export function buildToolFoldHtml(results: ProviderToolResult[]): string {
  return results
    .map(result => {
      const output = record(result.output);
      const input = record(result.input);
      let title = result.tool_name;
      let visible: Record<string, unknown>;
      if (result.tool_name === 'update_variables') {
        const patches = result.ok ? patchesFrom(output.patches) : undefined;
        title = `变量更新${patches ? ` · ${patches.length} 项` : ''}`;
        visible = patches ? { patches } : { note: '未记录已应用补丁明细。' };
      } else if (result.tool_name === 'read_skill') {
        const name = output.name ?? input.name;
        title = `读取技能${typeof name === 'string' ? ` · ${name}` : ''}`;
        visible = {
          name,
          ...(typeof output.content === 'string' ? { content: output.content } : { note: '未记录技能内容。' }),
        };
      } else if (result.tool_name === 'trigger_battle') {
        title = output.accepted === false ? '战斗请求 · 已跳过' : '战斗请求';
        visible = {
          encounterId: output.encounterId ?? output.encounter_id,
          accepted: output.accepted,
          battleState: output.battleState,
          reason: output.reason ?? output.narrative_reason ?? input.narrative_reason,
        };
      } else {
        visible = { note: '未提供可展示的结果明细。' };
      }
      const status = result.unconfirmed ? '未确认' : result.ok ? '已完成' : '失败';
      const saved = {
        tool_name: result.tool_name,
        tool_call_id: result.tool_call_id,
        ok: result.ok,
        ...(result.unconfirmed ? { unconfirmed: true } : {}),
        output: visible,
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
      return `\n\n<details class="chat-tool-chip"><summary>${escapeHtml(`${title} · ${status}`)}</summary><pre><code class="chat-tool-result-json">${escapeHtml(JSON.stringify(saved, null, 2))}</code></pre></details>\n`;
    })
    .join('');
}

// This explicit saved format is shared with prompt extraction; player details are never capped.
export function readToolChipPatches(block: string): VariablePathPatch[] | undefined {
  const match = block.match(/<code class="chat-tool-result-json">([\s\S]*?)<\/code>/);
  if (!match) return;
  try {
    const json = match[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
    const result = record(JSON.parse(json));
    return result.tool_name === 'update_variables' && result.ok === true
      ? patchesFrom(record(result.output).patches)
      : undefined;
  } catch {
    return;
  }
}
