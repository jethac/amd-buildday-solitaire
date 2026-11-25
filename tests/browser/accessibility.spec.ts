import { expect, test } from '@playwright/test';

test('piles and cards have useful accessible names without revealing hidden cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pile[data-zone="stock"]')).toHaveAttribute('aria-label', /Stock, 24 cards/);
  await expect(page.locator('.tableau-pile')).toHaveCount(7);
  await expect(page.locator('.tableau-pile[tabindex="0"]')).toHaveCount(7);
  await expect(page.locator('.tableau-pile .card.face-down[aria-hidden="true"]')).toHaveCount(21);
  const labels = await page.locator('.tableau-pile .card:not(.face-down)').evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''));
  expect(labels).toHaveLength(7);
  expect(labels.every((label) => /^(Red|Black) (Ace|[2-9]|10|Jack|Queen|King) of (spades|hearts|clubs|diamonds)/.test(label))).toBe(true);
  const hiddenText = await page.locator('.tableau-pile .card.face-down').evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')).join(' '));
  expect(hiddenText).not.toMatch(/of (spades|hearts|clubs|diamonds)/);
});

test('respects system reduced motion and persists explicit accessibility preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/reduce-motion/);
  await page.locator('#menu-button').click();
  await page.locator('label').filter({ hasText: 'High contrast' }).click();
  await page.locator('label').filter({ hasText: 'Show score' }).click();
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(page.locator('body')).toHaveClass(/high-contrast/);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/high-contrast/);
  await expect(page.locator('body')).toHaveClass(/reduce-motion/);
  await expect(page.locator('#score-stat')).toBeVisible();
  await page.locator('#menu-button').click();
  await expect(page.locator('#contrast-toggle')).toBeChecked();
  await expect(page.locator('#scoring-toggle')).toBeChecked();
});

test('pauses the active timer while a blocking dialog is open', async ({ page }) => {
  await page.goto('/');
  await page.locator('.pile[data-zone="stock"]').click();
  await page.locator('#menu-button').click();
  await page.waitForTimeout(1100);
  const pausedAt = await page.locator('#time-value').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('#time-value')).toHaveText(pausedAt ?? '00:00');
  await page.getByRole('button', { name: 'Close menu' }).click();
  await page.waitForTimeout(1250);
  expect(await page.locator('#time-value').textContent()).not.toBe(pausedAt);
});

test('keeps active time running after undo returns to zero moves', async ({ page }) => {
  await page.goto('/');
  await page.locator('.pile[data-zone="stock"]').click();
  await page.waitForTimeout(1100);
  const beforeUndo = await page.locator('#time-value').textContent();
  await page.locator('#undo-button').click();
  await expect(page.locator('#moves-value')).toHaveText('0');
  await page.waitForTimeout(1250);
  expect(await page.locator('#time-value').textContent()).not.toBe(beforeUndo);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('green-felt-solitaire.save.v1') ?? 'null'));
  expect(saved.timerStarted).toBe(true);
});

test('keyboard focus remains visible and every pile is reachable', async ({ page }) => {
  await page.goto('/');
  await page.locator('.pile[data-zone="stock"]').focus();
  await expect(page.locator('.pile[data-zone="stock"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.pile[data-zone="waste"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.foundation[data-index="0"]')).toBeFocused();
  await page.locator('.pile[data-zone="stock"]').focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement instanceof HTMLElement && !document.activeElement.closest('.game-board'))).toBe(true);
});
