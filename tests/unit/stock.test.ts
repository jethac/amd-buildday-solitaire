import { describe, expect, it } from 'vitest';
import {
  createGame,
  drawStock,
  recycleStock,
  undo,
  validateState,
  type DrawMode,
} from '../../src/game';
import { cardId, foundationThrough, makeFixture } from './helpers';

describe('stock and waste', () => {
  it('Draw 1 transfers only the top stock card face-up and undoes exactly', () => {
    const initial = createGame('draw-one');
    const top = initial.stock[initial.stock.length - 1];
    const drawn = drawStock(initial);
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.state.stock).toEqual(initial.stock.slice(0, -1));
    expect(drawn.state.waste).toEqual([top]);
    expect(drawn.state.cards[top].faceUp).toBe(true);
    expect(drawn.state.moves).toBe(1);
    expect(drawn.state.score).toBe(0);
    expect(drawn.transaction).toMatchObject({ kind: 'draw', cardIds: [top], scoreDelta: 0 });

    // Inputs and undo snapshots are independent live data.
    expect(initial.stock).toHaveLength(24);
    expect(initial.waste).toEqual([]);
    const restored = undo(drawn.state);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state).toEqual(initial);
  });

  it('Draw 3 transfers cards individually and a short final draw transfers all remaining cards', () => {
    const initial = createGame('draw-three', 3);
    const expected = initial.stock.slice(-3).reverse();
    const result = drawStock(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.waste).toEqual(expected);
    expect(result.state.stock).toEqual(initial.stock.slice(0, -3));
    expect(result.transaction.kind).toBe('draw');
    if (result.transaction.kind === 'draw') expect(result.transaction.cardIds).toEqual(expected);
    expect(expected.every((id) => result.state.cards[id].faceUp)).toBe(true);

    const shortStock = initial.stock.slice(-2);
    const short = makeFixture({ drawMode: 3, stock: shortStock });
    const oldWasteLength = short.waste.length;
    const shortResult = drawStock(short);
    expect(shortResult.ok).toBe(true);
    if (shortResult.ok) {
      expect(shortResult.state.stock).toEqual([]);
      expect(shortResult.state.waste.slice(oldWasteLength)).toEqual(shortStock.slice().reverse());
      expect(shortResult.transaction.kind).toBe('draw');
      if (shortResult.transaction.kind === 'draw') {
        expect(shortResult.transaction.cardIds).toHaveLength(2);
      }
      expect(validateState(shortResult.state).valid).toBe(true);
    }
  });

  it.each([1, 3] as DrawMode[])('recreates exact stock order after a complete Draw %s pass', (mode) => {
    const initial = createGame(`recycle-${mode}`, mode);
    let state = initial;
    const drawCount = Math.ceil(initial.stock.length / mode);
    for (let index = 0; index < drawCount; index += 1) {
      const result = drawStock(state);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }
    expect(state.stock).toEqual([]);
    expect(state.waste).toHaveLength(24);

    const recycled = recycleStock(state);
    expect(recycled.ok).toBe(true);
    if (!recycled.ok) return;
    expect(recycled.state.stock).toEqual(initial.stock);
    expect(recycled.state.waste).toEqual([]);
    expect(recycled.state.stock.every((id) => !recycled.state.cards[id].faceUp)).toBe(true);
    expect(recycled.state.moves).toBe(drawCount + 1);
    expect(recycled.state.score).toBe(0);
    expect(validateState(recycled.state).valid).toBe(true);

    const nextPass = drawStock(recycled.state);
    const firstPass = drawStock(initial);
    expect(nextPass.ok && firstPass.ok).toBe(true);
    if (nextPass.ok && firstPass.ok) {
      expect(nextPass.state.waste).toEqual(firstPass.state.waste);
      expect(nextPass.state.stock).toEqual(firstPass.state.stock);
    }
  });

  it('includes recycling and its move counter in one undo step', () => {
    const initial = createGame('undo-recycle');
    let state = initial;
    while (state.stock.length > 0) {
      const result = drawStock(state);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }
    const beforeRecycle = state;
    const recycled = recycleStock(state);
    if (!recycled.ok) throw new Error('Expected recycle');
    const restored = undo(recycled.state);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state).toEqual(beforeRecycle);
  });

  it('rejects invalid stock actions without touching state or history', () => {
    const game = createGame('bad-stock-actions');
    const recycled = recycleStock(game);
    expect(recycled.ok).toBe(false);
    if (!recycled.ok) expect(recycled.error.code).toBe('STOCK_NOT_EMPTY');
    expect(recycled.state).toBe(game);

    const empty = makeFixture({ stock: [] });
    const drawn = drawStock(empty);
    expect(drawn.ok).toBe(false);
    if (!drawn.ok) expect(drawn.error.code).toBe('STOCK_EMPTY');
    expect(drawn.state).toBe(empty);

    const noWaste = makeFixture({
      stock: [],
      foundations: {
        spades: foundationThrough('spades', 12),
        hearts: foundationThrough('hearts', 12),
        clubs: foundationThrough('clubs', 12),
        diamonds: foundationThrough('diamonds', 12),
      },
      tableau: [
        [cardId('spades', 13)],
        [cardId('hearts', 13)],
        [cardId('clubs', 13)],
        [cardId('diamonds', 13)],
      ],
    });
    expect(validateState(noWaste).valid).toBe(true);
    const rejected = recycleStock(noWaste);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe('WASTE_EMPTY');
    expect(rejected.state).toBe(noWaste);
    expect(empty.history).toEqual([]);
  });
});
