import { expect, test, type Page } from '@playwright/test';
import type { GameState, Suit } from '../../src/game';
import { cardId, foundationThrough, makeFixture } from '../unit/helpers';

const SUITS: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

function foundationsThrough(rank: number) {
  return Object.fromEntries(SUITS.map((suit) => [suit, foundationThrough(suit, rank)])) as GameState['foundations'];
}

function oneMoveFixture(): GameState {
  const foundations = foundationsThrough(13);
  foundations.spades = foundationThrough('spades', 12);
  return makeFixture({
    seed: 'browser-one-move',
    foundations,
    stock: [],
    tableau: [[cardId('spades', 13)]],
    elapsedMs: 125000,
  });
}

function autoCompleteFixture(): GameState {
  return makeFixture({
    seed: 'browser-autocomplete',
    foundations: foundationsThrough(12),
    stock: [cardId('hearts', 13), cardId('spades', 13), cardId('diamonds', 13), cardId('clubs', 13)],
  });
}

async function installFixture(page: Page, game: GameState): Promise<void> {
  await page.addInitScript((fixture) => {
    const key = 'green-felt-solitaire.save.v1';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      saveVersion: 1,
      savedAt: Date.now(),
      preferences: { drawMode: 1, scored: true, reduceMotion: false, highContrast: false },
      game: fixture,
    }));
  }, game);
}

test('wins through ordinary play, celebrates once, persists results, and replays', async ({ page }) => {
  await installFixture(page, oneMoveFixture());
  await page.goto('/');
  await expect(page.locator('#game-number-value')).toHaveText('browser-one-move');
  await expect(page.locator('.pile[data-zone="stock"] .recycle-icon')).toHaveCount(0);
  await expect(page.locator('.pile[data-zone="stock"]')).toHaveAttribute('aria-label', /Stock and waste are empty/);
  await expect(page.locator('#autocomplete-button')).toBeVisible();
  await page.locator('[data-card-id="spades-13"]').dblclick();
  await expect(page.locator('.victory-overlay')).toBeVisible();
  await expect(page.locator('#moves-value')).toHaveText('1');
  await page.keyboard.press('u');
  await expect(page.locator('#moves-value')).toHaveText('1');
  await page.getByRole('button', { name: 'Skip victory celebration' }).click();
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('#result-moves')).toHaveText('1');
  await expect(page.locator('#result-score')).toHaveText('10');
  await expect(page.locator('#result-time')).toHaveText('02:05');
  await expect(page.locator('.victory-overlay')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('.victory-overlay')).toHaveCount(0);
  await expect(page.locator('#moves-value')).toHaveText('1');
  await page.getByRole('button', { name: 'Replay deal' }).click();
  await expect(page.locator('#results-dialog')).toBeHidden();
  await expect(page.locator('#moves-value')).toHaveText('0');
  await expect(page.locator('.tableau-pile .card')).toHaveCount(28);
});

test('auto-completes all four suits and undo restores the entire atomic sequence', async ({ page }) => {
  await installFixture(page, autoCompleteFixture());
  await page.goto('/');
  await expect(page.locator('#autocomplete-button')).toBeVisible();
  await page.locator('#autocomplete-button').click();
  await expect(page.locator('#autocomplete-button')).toHaveText(/Skip/);
  await expect(page.locator('#restart-button')).toBeDisabled();
  await expect(page.locator('#undo-button')).toBeDisabled();
  await page.keyboard.press('u');
  await page.locator('#autocomplete-button').click();
  await expect(page.getByRole('button', { name: 'Skip victory celebration' })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Skip victory celebration' }).click();
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('#result-moves')).toHaveText('8');
  await expect(page.locator('#result-score')).toHaveText('40');
  for (let index = 0; index < 4; index += 1) {
    await expect(page.locator(`.foundation[data-index="${index}"]`)).toHaveAttribute('aria-label', /13 cards/);
  }

  await page.keyboard.press('Escape');
  await expect(page.locator('#results-dialog')).toBeHidden();
  await page.locator('#undo-button').click();
  await expect(page.locator('#moves-value')).toHaveText('0');
  await expect(page.locator('#score-value')).toHaveText('0');
  await expect(page.locator('.pile[data-zone="stock"]')).toHaveAttribute('aria-label', /4 cards/);
  for (let index = 0; index < 4; index += 1) {
    await expect(page.locator(`.foundation[data-index="${index}"]`)).toHaveAttribute('aria-label', /12 cards/);
  }
  await expect(page.locator('#autocomplete-button')).toBeVisible();
});

test('reduced-motion wins skip the canvas celebration and still permit undo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installFixture(page, oneMoveFixture());
  await page.goto('/');
  await page.locator('[data-card-id="spades-13"]').dblclick();
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('.victory-overlay')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('#undo-button').click();
  await expect(page.locator('[data-card-id="spades-13"]')).toBeVisible();
  await expect(page.locator('#moves-value')).toHaveText('0');
  await expect(page.locator('#results-dialog')).toBeHidden();
});
