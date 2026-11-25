import { expect, test } from '@playwright/test';

test('links safely to AMD Build Day', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'AMD Build Day' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://amd-advancing-ai.jp/buildday/');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(link).toHaveAttribute('rel', /noreferrer/);
});

test('production game loads without runtime errors or external requests', async ({ page }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') externalRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('#game-board .tableau-pile')).toHaveCount(7);
  await page.locator('.pile[data-zone="stock"]').click();
  await expect(page.locator('#moves-value')).toHaveText('1');
  await page.reload();
  await expect(page.locator('#moves-value')).toHaveText('1');
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('invalid storage data is replaced by a valid, playable production save', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('green-felt-solitaire.save.v1', JSON.stringify({
      saveVersion: 1,
      savedAt: Date.now(),
      preferences: { drawMode: 1, scored: false, reduceMotion: false, highContrast: false },
      game: { nonsense: true },
    }));
  });
  await page.goto('/');
  await expect(page.locator('#toast')).toContainText(/could not be restored/i);
  await expect(page.locator('.tableau-pile .card')).toHaveCount(28);
  await page.locator('.pile[data-zone="stock"]').click();
  const raw = await page.evaluate(() => localStorage.getItem('green-felt-solitaire.save.v1'));
  expect(raw).toBeTruthy();
  expect(raw).not.toContain('nonsense');
});
