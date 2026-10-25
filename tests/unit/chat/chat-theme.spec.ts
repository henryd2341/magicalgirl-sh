/* eslint-disable no-undef */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('chat theme styling', () => {
  it('preserves the actual panel and card theme surfaces, not only their class names', () => {
    const list = readFileSync(resolve(process.cwd(), 'src/ui/chat/ChatMessageList.vue'), 'utf-8');
    const row = readFileSync(resolve(process.cwd(), 'src/ui/chat/ChatMessageItem.vue'), 'utf-8');
    const css = readFileSync(resolve(process.cwd(), 'src/styles/_components.scss'), 'utf-8');
    expect(list).toMatch(/<section\s+id="chat-message-list"\s+class="chat-message-list mg-panel"/);
    expect(list).not.toMatch(/\.chat-message-list\s*\{/);
    expect(row).not.toMatch(/\.chat-message-card\s*\{/);
    expect(row).not.toMatch(/\.mg-sticker[^\n]*\{/);
    expect(css).toMatch(/\.chat-message-list,[\s\S]*?padding: var\(--mg-space-lg\);[\s\S]*?background: var\(--mg-bg-card\);/);
    expect(css).toMatch(/\.chat-message-card \{[\s\S]*?padding: var\(--mg-space-5\);[\s\S]*?box-shadow:/);
    expect(css).toMatch(/\.game-conversation-panel \{[\s\S]*?background-color: transparent;/);
  });

  it('uses the existing sticker variants without replacing their theme colors', () => {
    const row = readFileSync(resolve(process.cwd(), 'src/ui/chat/ChatMessageItem.vue'), 'utf-8');
    expect(row).toContain('class="mg-sticker mg-sticker--pink"');
    expect(row).toContain('class="mg-sticker mg-sticker--dark"');
    expect(row).not.toContain('.chat-message-card__status');
    for (const theme of ['e-girl', 'kidcore', 'pastel-brutalism']) {
      const source = readFileSync(resolve(process.cwd(), `src/styles/themes/_${theme}.scss`), 'utf-8');
      expect(source).toContain('.mg-sticker');
      expect(source).toContain('&--pink');
      expect(source).toContain('&--dark');
    }
  });

  it('sizes closed tool chips to their summaries and expands only open results without changing legacy folds', () => {
    const row = readFileSync(resolve(process.cwd(), 'src/ui/chat/ChatMessageItem.vue'), 'utf-8');
    const rule = (selector: string) => row.split(`${selector} {`)[1]?.split('}')[0];
    const chip = rule('.chat-message-card__content :deep(.chat-tool-chip)');
    expect(chip).toContain('box-sizing: border-box;');
    expect(chip).toContain('max-width: 100%;');
    expect(chip).toContain('overflow-wrap: anywhere;');
    expect(chip).toContain('border-radius: var(--mg-radius-sm);');
    const closed = rule('.chat-message-card__content :deep(.chat-tool-chip:not([open]))');
    expect(closed).toContain('display: inline-block;');
    expect(closed).toContain('width: fit-content;');
    const open = rule('.chat-message-card__content :deep(.chat-tool-chip[open])');
    expect(open).toContain('display: block;');
    expect(open).toContain('width: 100%;');
    expect(row).toMatch(/:deep\(summary\) \{\s*min-height: 44px;/);
    expect(row).toContain(':deep(summary:focus-visible)');
    expect(row).toMatch(/:deep\(\.chat-tool-fold\),\s*\.chat-message-card__content :deep\(\.mg-fold\) \{[^}]*padding: 0 12px;[^}]*margin: 12px 0 0;/);
    expect(row).not.toMatch(/:deep\(\.chat-tool-chip\),\s*\.chat-message-card__content :deep\(\.chat-tool-fold\)/);
  });

  it('keeps chat surfaces anchored to the dark theme tokens instead of bright paper backgrounds', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/_components.scss'), 'utf-8');

    expect(css).toContain('.chat-message-list');
    expect(css).toContain('.chat-input-box');
    expect(css).toContain('.failed-draft-actions');
    expect(css).toContain('background: var(--mg-bg-card);');
    expect(css).toContain('color: var(--mg-text);');
    expect(css).toContain('.chat-message-card--user');
    expect(css).toContain('.chat-message-card--assistant');
    expect(css).toContain('.chat-message-card--failed');
    expect(css).not.toContain('background: rgba(255, 244, 250, 0.92);');
    expect(css).not.toContain('background: rgba(255, 255, 255, 0.88);');
    expect(css).not.toContain('background: rgba(255, 255, 255, 0.95);');
  });
});
