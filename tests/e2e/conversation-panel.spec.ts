import { expect, test, type Page } from '@playwright/test';
import type {} from './fixtures/conversation';

async function open(page: Page, count = 1000, extra = '') {
  await page.goto(`/tests/e2e/fixtures/conversation.html?count=${count}${extra}`);
  await page.waitForFunction(n => window.conversationFixture?.store.messages.length === n, count);
  await bottom(page);
}
async function bottom(page: Page) {
  await expect.poll(() => page.evaluate(() => window.conversationFixture.metrics().bottom)).toBeLessThanOrEqual(2);
}
async function settledScrollTop(page: Page) {
  return page.getByRole('region', { name: '对话记录', exact: true }).evaluate(async el => {
    let offset = el.scrollTop;
    let stable = 0;
    while (stable < 3) {
      await new Promise(requestAnimationFrame);
      stable = el.scrollTop === offset ? stable + 1 : 0;
      offset = el.scrollTop;
    }
    return offset;
  });
}
async function home(page: Page) {
  await page.getByRole('region', { name: '对话记录', exact: true }).focus();
  await page.keyboard.press('Home');
}

for (const count of [100, 1000]) {
  test(`${count} messages: bounded continuous head, middle and tail without search`, async ({ page }) => {
    await open(page, count);
    await expect(page.locator('#chat-message-list')).toHaveClass(/chat-message-list mg-panel/);
    await expect(page.locator('.mg-sticker--pink').first()).toBeVisible();
    expect((await page.evaluate(() => window.conversationFixture.metrics())).rows).toBeLessThanOrEqual(18);
    const stream = await page.evaluate(() => window.conversationFixture.stream());
    expect(stream?.lists).toBe(0);
    expect(stream?.renders).toBe(1);
    await bottom(page);
    await home(page);
    await expect(page.locator('#chat-message-fixture-0')).toBeVisible();
    await page.locator('.fixture-scroll').evaluate(el => {
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    });
    await settledScrollTop(page);
    expect(await page.locator('.chat-message-row').count()).toBeLessThanOrEqual(18);
    expect(Number(await page.locator('.chat-message-row').first().getAttribute('data-index'))).toBeGreaterThan(0);
    await page.keyboard.press('End');
    await bottom(page);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
  });
}

test('preloaded, delayed, empty and giant-single-row entry reach the physical footer', async ({ page }) => {
  for (const [count, extra] of [
    [1, ''],
    [100, '&delay=300'],
    [0, ''],
  ] as const)
    await open(page, count, extra);
});

test('reading anchor survives streaming and height changes above the reader', async ({ page }) => {
  await open(page);
  await home(page);
  await page.locator('.fixture-scroll').evaluate(el => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  });
  await settledScrollTop(page);
  const anchor = await page.evaluate(() => {
    const port = document.querySelector('.fixture-scroll')!.getBoundingClientRect();
    const rows = [...document.querySelectorAll<HTMLElement>('.chat-message-row')];
    const row = rows.find(
      el => el.getBoundingClientRect().top >= port.top && el.getBoundingClientRect().top < port.bottom,
    )!;
    const index = rows.indexOf(row);
    return { id: row.id, above: rows[index - 2]!.dataset.messageId, y: row.getBoundingClientRect().y };
  });
  const row = page.locator(`#${anchor.id}`);
  await page.evaluate(() => window.conversationFixture.stream());
  await expect.poll(async () => Math.abs((await row.boundingBox())!.y - anchor.y)).toBeLessThanOrEqual(2);
  await page.evaluate(id => {
    window.conversationFixture.store.messages.find(message => message.id === id)!.content +=
      '\n\n' + '上方新增正文。'.repeat(500);
  }, anchor.above);
  await expect.poll(async () => Math.abs((await row.boundingBox())!.y - anchor.y)).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: '↓ 回到最新' }).click();
  await bottom(page);
});

test('editor and focus pins survive leaving range; replacement clears stale drafts', async ({ page }) => {
  await open(page);
  const row = page.locator('#chat-message-fixture-998');
  await row.getByRole('button', { name: '编辑消息', exact: true }).click();
  const editor = row.getByRole('textbox', { name: '编辑消息内容' });
  await editor.fill('未完成的原始草稿');
  await page.locator('.fixture-scroll').hover();
  await page.mouse.wheel(0, -8000);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('未完成的原始草稿');
  expect(await page.locator('.chat-message-row').count()).toBeLessThanOrEqual(19);
  await page.getByRole('button', { name: '↓ 回到最新' }).click();
  await bottom(page);
  await expect(editor).toHaveValue('未完成的原始草稿');
  await page.evaluate(() => window.conversationFixture.reset(1000, 'replacement'));
  await bottom(page);
  await expect(page.getByRole('textbox', { name: '编辑消息内容' })).toHaveCount(0);
  expect(await page.locator('[data-message-id^="fixture-"]').count()).toBe(0);
});

test('native disclosures survive remount and reasoning can collapse during generation', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const row = window.conversationFixture.store.messages.find(message => message.id === 'fixture-998')!;
    row.content = '<details><summary>街角的信</summary><p>保留的正文</p></details>';
  });
  await bottom(page);
  const row = page.locator('#chat-message-fixture-998');
  await row.locator('summary').click();
  await expect(row.locator('details')).toHaveAttribute('open', '');
  await home(page);
  await expect(row).toHaveCount(0);
  await page.keyboard.press('End');
  await bottom(page);
  await expect(row.locator('details')).toHaveAttribute('open', '');
  await page.evaluate(() => {
    const row = window.conversationFixture.store.messages.find(message => message.id === 'fixture-998')!;
    row.provisional = true;
    row.reasoning = '可收起的思考';
  });
  const toggle = row.getByRole('button', { name: /思考过程/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await page.evaluate(() => {
    window.conversationFixture.store.messages.find(message => message.id === 'fixture-998')!.reasoning += '新的内容';
  });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('a top-spanning long message stays readable after width/font reflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, 1);
  await home(page);
  const row = page.locator('#chat-message-fixture-0');
  await page.locator('.fixture-scroll').hover();
  await page.mouse.wheel(0, 7000);
  await expect.poll(async () => (await row.boundingBox())!.y).toBeLessThan(-6000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect
    .poll(async () => {
      const box = (await row.boundingBox())!;
      return box.y + box.height;
    })
    .toBeGreaterThan(48);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '20px';
  });
  await expect(row).toBeVisible();
  await expect(page.getByRole('button', { name: '↓ 回到最新' })).toBeVisible();
});

test('native arrow and space scrolling suspend follow without intercepting message controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await open(page);
  const region = page.getByRole('region', { name: '对话记录', exact: true });
  for (const key of ['ArrowUp', 'Shift+Space']) {
    await region.focus();
    for (let n = 0; n < (key === 'ArrowUp' ? 12 : 1); n++) await page.keyboard.press(key);
    await expect.poll(() => page.evaluate(() => window.conversationFixture.metrics().bottom)).toBeGreaterThan(100);
    await expect(page.getByRole('button', { name: '↓ 回到最新' })).toBeVisible();
    const top = await settledScrollTop(page);
    await page.evaluate(() => window.conversationFixture.stream());
    await expect.poll(() => region.evaluate(el => el.scrollTop)).toBe(top);
    await page.getByRole('button', { name: '↓ 回到最新' }).click();
    await bottom(page);
  }
  await page.evaluate(() => {
    window.conversationFixture.store.messages.at(-1)!.provisional = false;
  });
  await bottom(page);
  const row = page.locator('#chat-message-fixture-999');
  await row.getByRole('button', { name: '编辑消息', exact: true }).focus();
  await page.keyboard.press('Space');
  const editor = row.getByRole('textbox', { name: '编辑消息内容' });
  await expect(editor).toBeFocused();
  await editor.fill('正文');
  await page.keyboard.press('End');
  await page.keyboard.press('Space');
  await expect(editor).toHaveValue('正文 ');
});

test('native arrow scrolling from a focused message action suspends follow', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await open(page);
  const copy = page.locator('#chat-message-fixture-999').getByRole('button', { name: '复制消息原始内容' });
  await copy.focus();
  for (let n = 0; n < 12; n++) await page.keyboard.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.conversationFixture.metrics().bottom)).toBeGreaterThan(50);
  await expect(copy).toBeFocused();
  await expect(page.getByRole('button', { name: '↓ 回到最新' })).toBeVisible();
  const region = page.getByRole('region', { name: '对话记录', exact: true });
  const top = await settledScrollTop(page);
  await page.evaluate(() => window.conversationFixture.stream());
  await expect.poll(() => region.evaluate(el => el.scrollTop)).toBe(top);
  await expect(page.getByRole('button', { name: '↓ 回到最新' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('focused-action-reading.png'), animations: 'disabled' });
});

test('upward thumb drag stays reading and deliberate downward return restores follow', async ({
  playwright,
  channel,
  baseURL,
}, info) => {
  const browser = await playwright.chromium.launch({
    channel,
    headless: true,
    ignoreDefaultArgs: ['--hide-scrollbars'],
  });
  const page = await browser.newPage({ baseURL, viewport: { width: 1280, height: 900 } });
  try {
    await open(page, 1);
    const region = page.getByRole('region', { name: '对话记录', exact: true });
    const bounds = (await region.boundingBox())!;
    const scrollbar = await region.evaluate(el => el.offsetWidth - el.clientWidth);
    expect(scrollbar).toBeGreaterThan(0);
    const x = bounds.x + bounds.width - scrollbar / 2;
    const y = bounds.y + bounds.height - 30;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 1);
    await expect.poll(() => page.evaluate(() => window.conversationFixture.metrics().bottom)).toBeGreaterThan(2);
    await expect(page.getByRole('button', { name: '↓ 回到最新' })).toBeVisible();
    await page.mouse.move(x, y - 140, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.conversationFixture.metrics().bottom)).toBeGreaterThan(500);
    const top = await region.evaluate(el => el.scrollTop);
    await page.evaluate(() => window.conversationFixture.stream());
    await expect.poll(() => region.evaluate(el => el.scrollTop)).toBe(top);
    await page.screenshot({ path: info.outputPath('native-scrollbar-reading.png'), animations: 'disabled' });
    const thumb = await region.evaluate(el => {
      const width = el.offsetWidth - el.clientWidth;
      const track = el.clientHeight - width * 2;
      const size = Math.max(17, (track * el.clientHeight) / el.scrollHeight);
      return (
        el.getBoundingClientRect().y +
        width +
        ((track - size) * el.scrollTop) / (el.scrollHeight - el.clientHeight) +
        size / 2
      );
    });
    await page.mouse.move(x, thumb);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 });
    await page.mouse.up();
    await bottom(page);
    await expect(page.getByRole('button', { name: '↓ 回到最新' })).toHaveCount(0);
    await page.evaluate(() => window.conversationFixture.stream());
    await bottom(page);
  } finally {
    await browser.close();
  }
});

test('route activation resets to latest; same-id growth includes reasoning and tools', async ({ page }) => {
  await open(page);
  await home(page);
  await page.evaluate(() => window.conversationFixture.activate(false));
  await page.evaluate(() => window.conversationFixture.activate(true));
  await bottom(page);
  const reasoning = await page.evaluate(() => window.conversationFixture.stream(true));
  expect(reasoning?.lists).toBe(0);
  expect(reasoning?.renders).toBe(0);
  await bottom(page);
  await page.evaluate(() => {
    window.conversationFixture.store.messages.at(-1)!.content +=
      '<details class="chat-tool-fold"><summary>工具调用 (1)</summary><p>完整原始记录</p></details>';
  });
  await bottom(page);
});

for (const width of [360, 390, 1280]) {
  for (const theme of ['e-girl', 'kidcore', 'pastel-brutalism']) {
    test(`${theme} ${width}px retains sticker badges, readable controls and disclosures`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, 1, `&theme=${theme}`);
      await page.evaluate(() => {
        const row = window.conversationFixture.store.messages[0]!;
        row.role = 'assistant';
        row.content = '雨后的街道。<details><summary>街角的信</summary><p>可展开的正文</p></details>';
        row.reasoning = '完整保留的思考过程';
      });
      await bottom(page);
      await home(page);
      const row = page.locator('#chat-message-fixture-0');
      await row.locator('summary').click();
      const box = (await row.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await expect(row.locator('.mg-sticker--pink')).toHaveText('叙事 AI');
      await expect(row.locator('.mg-sticker--dark')).toHaveText('生成中');
      expect(
        await row
          .locator('.chat-message-card__reasoning-content')
          .evaluate(el => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(14);
      const latest = page.getByRole('button', { name: '↓ 回到最新' });
      const latestBox = (await latest.boundingBox())!;
      expect(latestBox.height).toBeGreaterThanOrEqual(44);
      expect(latestBox.y + latestBox.height).toBeLessThanOrEqual(
        (await page.locator('.fixture-input').boundingBox())!.y,
      );
      if (width < 640)
        expect(latestBox.x + latestBox.width).toBeLessThanOrEqual(
          (await page.locator('.fixture-mobile').boundingBox())!.x,
        );
      await page.screenshot({ path: info.outputPath(`${theme}-${width}.png`), animations: 'disabled' });
      await latest.click();
      await bottom(page);
    });
  }
}
