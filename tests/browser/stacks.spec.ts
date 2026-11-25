import { expect, test } from '@playwright/test';
import { cardId, makeFixture } from '../unit/helpers';

test('drags and undoes an entire valid descending tableau sequence', async ({ page }) => {
  const game = makeFixture({
    seed: 'browser-stack-drag',
    stock: [],
    tableau: [
      [cardId('diamonds', 7), cardId('spades', 6), cardId('hearts', 5)],
      [cardId('clubs', 8)],
    ],
  });
  await page.addInitScript((fixture) => {
    if (localStorage.getItem('green-felt-solitaire.save.v1')) return;
    localStorage.setItem('green-felt-solitaire.save.v1', JSON.stringify({
      saveVersion: 1,
      savedAt: Date.now(),
      preferences: { drawMode: 1, scored: true, reduceMotion: true, highContrast: false },
      game: fixture,
    }));
  }, game);
  await page.goto('/');
  const firstColumn = page.locator('.tableau-pile[data-index="0"]');
  const secondColumn = page.locator('.tableau-pile[data-index="1"]');
  await expect(firstColumn.locator('.card')).toHaveCount(3);
  const source = page.locator('[data-card-id="diamonds-7"]');
  const next = page.locator('[data-card-id="spades-6"]');
  const sourceBox = await source.boundingBox();
  const nextBox = await next.boundingBox();
  const cornerBox = await source.locator('.card-corner').first().boundingBox();
  expect(cornerBox && nextBox && sourceBox ? nextBox.y - sourceBox.y >= cornerBox.height - 1 : false).toBe(true);
  const targetBox = await secondColumn.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Could not measure tableau stack.');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 15, sourceBox.y + 35, { steps: 3 });
  await expect(page.locator('#drag-layer .card')).toHaveCount(3);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 25, { steps: 6 });
  await page.mouse.up();
  await expect(firstColumn.locator('.card')).toHaveCount(0);
  await expect(secondColumn.locator('.card')).toHaveCount(4);
  await expect(secondColumn.locator('[data-card-id="diamonds-7"]')).toBeVisible();
  await expect(secondColumn.locator('[data-card-id="spades-6"]')).toBeVisible();
  await expect(secondColumn.locator('[data-card-id="hearts-5"]')).toBeVisible();
  await expect(page.locator('#moves-value')).toHaveText('1');
  await expect(page.locator('#score-value')).toHaveText('0');
  await page.locator('#undo-button').click();
  await expect(firstColumn.locator('.card')).toHaveCount(3);
  await expect(secondColumn.locator('.card')).toHaveCount(1);
  await expect(page.locator('#moves-value')).toHaveText('0');
});
