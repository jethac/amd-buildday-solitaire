import { describe, expect, it } from 'vitest';
import {
  createGame,
  drawStock,
  enumerateLegalActions,
  moveCards,
  recycleStock,
  undo,
  validateState,
  validateMove,
  type DrawMode,
  type GameState,
} from '../../src/game';

function expectValid(state: GameState): void {
  const result = validateState(state);
  expect(result.valid, JSON.stringify(result.issues)).toBe(true);
}

/** Local deterministic generator for test action selection, independent of deal generation. */
function generator(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value;
  };
}

describe('generated legal and illegal action sequences', () => {
  it.each([1, 3] as DrawMode[])('preserves all invariants through generated Draw %s actions', (drawMode) => {
    const random = generator(drawMode === 1 ? 0x12345678 : 0xabcdef01);
    const original = createGame(`generated-${drawMode}`, drawMode, 'scored');
    let state = original;
    let acceptedActions = 0;

    for (let step = 0; step < 180; step += 1) {
      if (step % 11 === 10 && state.history.length > 0) {
        const restored = undo(state);
        expect(restored.ok).toBe(true);
        if (!restored.ok) throw new Error(restored.error.message);
        state = restored.state;
        expectValid(state);
        continue;
      }

      const legalActions = enumerateLegalActions(state);
      if (legalActions.length > 0) {
        const action = legalActions[random() % legalActions.length];
        if (action.kind === 'move') {
          expect(validateMove(state, action.source, action.destination, action.startIndex).valid).toBe(true);
          const result = moveCards(state, action.source, action.destination, action.startIndex);
          expect(result.ok).toBe(true);
          if (!result.ok) throw new Error(result.error.message);
          state = result.state;
        } else if (action.kind === 'draw-stock') {
          const result = drawStock(state);
          expect(result.ok).toBe(true);
          if (!result.ok) throw new Error(result.error.message);
          state = result.state;
        } else {
          const result = recycleStock(state);
          expect(result.ok).toBe(true);
          if (!result.ok) throw new Error(result.error.message);
          state = result.state;
        }
        acceptedActions += 1;
        expectValid(state);
      }

      // These generated illegal commands must return the identical state reference.
      const invalidPile = moveCards(
        state,
        { type: 'tableau', index: 99 },
        { type: 'tableau', index: 0 },
      );
      expect(invalidPile.ok).toBe(false);
      expect(invalidPile.state).toBe(state);

      const fromStock = moveCards(state, { type: 'stock' }, { type: 'tableau', index: 0 });
      expect(fromStock.ok).toBe(false);
      expect(fromStock.state).toBe(state);

      const toWaste = moveCards(
        state,
        { type: 'foundation', suit: 'spades' },
        { type: 'waste' },
      );
      expect(toWaste.ok).toBe(false);
      expect(toWaste.state).toBe(state);
      expectValid(state);
    }

    expect(acceptedActions).toBeGreaterThan(150);
    expect(state.seed).toBe(original.seed);
    expect(state.dealVersion).toBe(original.dealVersion);
  });
});
