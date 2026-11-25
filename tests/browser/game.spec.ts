import { expect, test, type Page } from '@playwright/test';

async function openFresh(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Solitaire' }).or(page.locator('.brand-copy strong'))).toBeVisible();
}

async function openMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Game menu' })).toBeVisible();
}

async function dealSeed(page: Page, seed: string): Promise<void> {
  await openMenu(page);
  await page.getByLabel('Game number', { exact: true }).fill(seed);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Game menu' })).toBeHidden();
}

test('deals a complete table, draws, undoes, restarts, and resumes', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('.tableau-pile')).toHaveCount(7);
  await expect(page.locator('.foundation')).toHaveCount(4);
  await expect(page.locator('.tableau-pile .card.face-down')).toHaveCount(21);
  await expect(page.locator('.tableau-pile .card:not(.face-down)')).toHaveCount(7);
  await expect(page.locator('#moves-value')).toHaveText('0');
  await dealSeed(page, '123456');
  await expect(page.locator('#game-number-value')).toHaveText('123456');

  await page.locator('.pile[data-zone="stock"]').click();
  await expect(page.locator('#moves-value')).toHaveText('1');
  await expect(page.locator('.pile[data-zone="waste"] .card:not(.face-down)')).toHaveCount(1);
  await expect(page.locator('.pile[data-zone="stock"]')).toHaveAttribute('aria-label', /23 cards/);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#moves-value')).toHaveText('0');
  await expect(page.locator('.pile[data-zone="waste"] .card')).toHaveCount(0);
  await expect(page.locator('.pile[data-zone="stock"]')).toHaveAttribute('aria-label', /24 cards/);

  await page.locator('.pile[data-zone="stock"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#moves-value')).toHaveText('1');
  await page.reload();
  await expect(page.locator('#game-number-value')).toHaveText('123456');
  await expect(page.locator('#moves-value')).toHaveText('1');
  await expect(page.locator('.pile[data-zone="waste"] .card')).toHaveCount(1);

  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Restart this deal?' })).toBeVisible();
  await page.getByRole('button', { name: 'Restart deal', exact: true }).click();
  await expect(page.locator('#moves-value')).toHaveText('0');
  await expect(page.locator('.pile[data-zone="waste"] .card')).toHaveCount(0);
  await expect(page.locator('#game-number-value')).toHaveText('123456');
});

test('reproduces the exact tableau for the same game number', async ({ page }) => {
  await openFresh(page);
  const tableauIds = () => page.locator('.tableau-pile').evaluateAll((piles) => piles.map((pile) => [...pile.querySelectorAll<HTMLElement>('.card')].map((card) => `${card.dataset.cardId}:${card.classList.contains('face-down')}`).join(',')));
  await dealSeed(page, '111111');
  const original = await tableauIds();
  await dealSeed(page, '222222');
  expect(await tableauIds()).not.toEqual(original);
  await dealSeed(page, '111111');
  expect(await tableauIds()).toEqual(original);
});

test('supports Draw 3, preferences, help, hints, and game-number copying', async ({ page }) => {
  await openFresh(page);
  await openMenu(page);
  await page.locator('#new-draw-3').click();
  await expect(page.locator('#draw-mode-label')).toHaveText('Draw 3');
  await page.locator('.pile[data-zone="stock"]').click();
  await expect(page.locator('.pile[data-zone="waste"]')).toHaveAttribute('aria-label', /3 cards/);

  await openMenu(page);
  await page.locator('label').filter({ hasText: 'Show score' }).click();
  await page.locator('label').filter({ hasText: 'Reduce motion' }).click();
  await page.locator('label').filter({ hasText: 'High contrast' }).click();
  await expect(page.locator('body')).toHaveClass(/reduce-motion/);
  await expect(page.locator('body')).toHaveClass(/high-contrast/);
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(page.locator('#score-stat')).toBeVisible();

  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect(page.locator('.hint-card, .hint-target').first()).toBeVisible();
  await page.waitForTimeout(2200);
  await expect(page.locator('.hint-card, .hint-source, .hint-target')).toHaveCount(0);

  await page.locator('#help-button').click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await expect(page.locator('#help-dialog')).toContainText('Only a King');
  await page.getByRole('button', { name: 'Back to the cards' }).click();
  await expect(page.locator('#help-dialog')).toBeHidden();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } }));
  await page.locator('#game-number-button').click();
  await expect(page.locator('#toast')).toContainText(/Game number/i);
});

test('provides a selectable in-dialog fallback when clipboard access fails', async ({ page }) => {
  await openFresh(page);
  const seed = await page.locator('#game-number-value').textContent();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.locator('#game-number-button').click();
  await expect(page.locator('#menu-dialog')).toBeVisible();
  await expect(page.locator('#seed-input')).toHaveValue(seed ?? '');
  await expect(page.locator('#seed-input')).toBeFocused();
  await expect(page.locator('#menu-copy-status')).toContainText('selected for you to copy');
  expect(await page.locator('#seed-input').evaluate((input: HTMLInputElement) => input.selectionStart === 0 && input.selectionEnd === input.value.length)).toBe(true);
});

test('is usable at phone width and keeps every column on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFresh(page);
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    cards: [...document.querySelectorAll<HTMLElement>('.tableau-pile')].map((pile) => {
      const rect = pile.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }),
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.cards).toHaveLength(7);
  expect(dimensions.cards.every((card) => card.left >= 0 && card.right <= dimensions.viewport && card.width >= 35)).toBe(true);
  await page.locator('.pile[data-zone="stock"]').click();
  await expect(page.locator('#moves-value')).toHaveText('1');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.tableau-pile')).toHaveCount(7);
  await expect(page.locator('.pile[data-zone="waste"] .card')).toHaveCount(1);
});

test('executes hinted legal moves with both click-to-move and pointer dragging', async ({ page }) => {
  await openFresh(page);
  await dealSeed(page, '123456');
  let source = page.locator('.hint-card');
  let target = page.locator('.pile.hint-target');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.locator('#hint-button').click();
    source = page.locator('.hint-card');
    target = page.locator('.pile.hint-target');
    if (await source.count() && await target.count()) break;
    await page.locator('.pile[data-zone="stock"]').click();
  }
  await expect(source).toHaveCount(1);
  await expect(target).toHaveCount(1);
  const cardId = await source.getAttribute('data-card-id');
  const targetZone = await target.getAttribute('data-zone');
  const targetIndex = await target.getAttribute('data-index');
  expect(cardId).toBeTruthy();
  const movesBefore = Number(await page.locator('#moves-value').textContent());

  await source.click();
  await target.click();
  await expect(page.locator('#moves-value')).toHaveText(String(movesBefore + 1));

  await page.locator('#undo-button').click();
  const restoredSource = page.locator(`[data-card-id="${cardId}"]`);
  const restoredTarget = page.locator(`.pile[data-zone="${targetZone}"][data-index="${targetIndex}"]`);
  await restoredSource.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });
  const sourceBox = await restoredSource.boundingBox();
  const targetBox = await restoredTarget.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Could not measure restored hinted move.');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + 30, { steps: 3 });
  await expect(page.locator('#drag-layer')).toHaveClass(/active/);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + Math.min(30, targetBox.height / 2), { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#moves-value')).toHaveText(String(movesBefore + 1));
  await expect(page.locator('#drag-layer')).not.toHaveClass(/active/);
});

test('rejects an illegal move without changing counters or save history', async ({ page }) => {
  await openFresh(page);
  await dealSeed(page, '123456');
  const nonAce = page.locator('.tableau-pile .card:not(.face-down):not([aria-label*="Ace of"])').first();
  await expect(nonAce).toBeVisible();
  const sourceId = await nonAce.getAttribute('data-card-id');
  await nonAce.click();
  await page.locator('.foundation[data-index="0"]').click();
  await expect(page.locator('#moves-value')).toHaveText('0');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(page.locator(`[data-card-id="${sourceId}"]`)).toBeVisible();
});

test('performs a hinted move entirely with the keyboard', async ({ page }) => {
  await openFresh(page);
  await dealSeed(page, '98765');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.locator('#hint-button').click();
    if (await page.locator('.hint-card').count()) break;
    await page.locator('.pile[data-zone="stock"]').click();
  }
  const source = page.locator('.hint-card');
  const target = page.locator('.pile.hint-target');
  await expect(source).toHaveCount(1);
  await expect(target).toHaveCount(1);
  const sourceId = await source.getAttribute('data-card-id');
  const sourcePile = page.locator(`.pile[data-zone="${await source.getAttribute('data-zone')}"][data-index="${await source.getAttribute('data-index')}"]`);
  const movesBefore = Number(await page.locator('#moves-value').textContent());
  await sourcePile.focus();
  if ((await source.getAttribute('data-zone')) === 'tableau') {
    for (let index = 0; index < 14; index += 1) {
      if (await sourcePile.locator('.keyboard-selected').getAttribute('data-card-id') === sourceId) break;
      await page.keyboard.press('ArrowDown');
    }
  }
  await page.keyboard.press('Enter');
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#moves-value')).toHaveText(String(movesBefore + 1));
});

test.describe('touch interaction', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('draws with a real touch tap without sacrificing scroll or target sizes', async ({ page }) => {
    await openFresh(page);
    const touchMetrics = await page.evaluate(() => ({
      pileAction: getComputedStyle(document.querySelector('.tableau-pile')!).touchAction,
      cardAction: getComputedStyle(document.querySelector('.tableau-pile .card')!).touchAction,
      controlHeights: [...document.querySelectorAll('.game-header button, .play-controls button')].filter((button) => button.getClientRects().length > 0).map((button) => button.getBoundingClientRect().height),
    }));
    expect(touchMetrics.pileAction).toBe('pan-y');
    expect(touchMetrics.cardAction).toBe('none');
    expect(touchMetrics.controlHeights.every((height) => height >= 44)).toBe(true);
    const stock = page.locator('.pile[data-zone="stock"]');
    const box = await stock.boundingBox();
    if (!box) throw new Error('Stock has no touch target.');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#moves-value')).toHaveText('1');
    await expect(page.locator('.pile[data-zone="waste"] .card')).toHaveCount(1);
  });
});

test('recovers from a corrupt save without breaking play', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('green-felt-solitaire.save.v1', '{broken json'));
  await openFresh(page);
  await expect(page.locator('#toast')).toContainText(/could not be restored|couldn’t be restored/i);
  await page.locator('.pile[data-zone="stock"]').click();
  await expect(page.locator('#moves-value')).toHaveText('1');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('green-felt-solitaire.save.v1') ?? 'null'));
  expect(saved.saveVersion).toBe(1);
  expect(saved.game).toBeTruthy();
});
