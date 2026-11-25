import { describe, expect, it } from 'vitest';
import {
  autoMoveToFoundation,
  cloneGameState,
  createGame,
  drawStock,
  moveCards,
  restartGame,
  setScoringMode,
  undo,
  validateState,
  type PileRef,
} from '../../src/game';
import { cardId, liveSnapshot, makeFixture } from './helpers';

const tableau = (index: number): PileRef => ({ type: 'tableau', index });

describe('automatic reveals and unlimited undo', () => {
  it('reveals a newly exposed hidden tableau card in the same atomic move and undo', () => {
    const hiddenId = cardId('diamonds', 5);
    const initial = makeFixture({
      tableau: [[{ id: hiddenId, faceUp: false }, cardId('clubs', 8)], [cardId('hearts', 9)]],
    });
    const result = moveCards(initial, tableau(0), tableau(1), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.cards[hiddenId].faceUp).toBe(true);
    expect(result.state.tableau[0]).toEqual([hiddenId]);
    expect(result.state.score).toBe(5);
    expect(result.state.moves).toBe(1);
    expect(result.state.history).toHaveLength(1);
    expect(result.transaction).toMatchObject({
      kind: 'move',
      revealedCardId: hiddenId,
      scoreDelta: 5,
      moveCountDelta: 1,
    });
    expect(initial.cards[hiddenId].faceUp).toBe(false);
    expect(result.state.history[0].snapshot.tableau[0]).not.toBe(result.state.tableau[0]);
    expect(result.state.history[0].snapshot.cards[hiddenId]).not.toBe(result.state.cards[hiddenId]);

    const restored = undo(result.state);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.state).toEqual(initial);
      expect(restored.state.history).toEqual([]);
      expect(validateState(restored.state).valid).toBe(true);
    }
  });

  it('reverses an arbitrary number of clean transactions in order', () => {
    const initial = createGame('many-undos');
    let state = initial;
    for (let index = 0; index < 12; index += 1) {
      const result = drawStock(state);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }
    for (let index = 0; index < 12; index += 1) {
      const result = undo(state);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }
    expect(state).toEqual(initial);
    const none = undo(state);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.code).toBe('NOTHING_TO_UNDO');
  });

  it('keeps retained history snapshots independent between successive versions', () => {
    const initial = createGame('independent-history');
    const first = drawStock(initial);
    if (!first.ok) throw new Error(first.error.message);
    const second = drawStock(first.state);
    if (!second.ok) throw new Error(second.error.message);
    expect(second.state.history).toHaveLength(2);
    expect(second.state.history[0]).not.toBe(first.state.history[0]);
    expect(second.state.history[0].snapshot).not.toBe(first.state.history[0].snapshot);
    expect(second.state.history[0].snapshot.stock).not.toBe(first.state.history[0].snapshot.stock);
    expect(second.state.history[0].snapshot.cards).not.toBe(first.state.history[0].snapshot.cards);
    expect(second.state.history[0].transaction).not.toBe(first.state.history[0].transaction);
  });

  it('preserves current elapsed time rather than restoring snapshot time', () => {
    const initial = createGame('timer-undo');
    const result = drawStock(initial);
    if (!result.ok) throw new Error(result.error.message);
    const progressed = cloneGameState(result.state);
    progressed.elapsedMs = 12_345;
    const restored = undo(progressed);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state.elapsedMs).toBe(12_345);
  });
});

describe('classic-inspired score table', () => {
  it('adds 5 for waste to tableau and 10 plus 5 for foundation with a reveal', () => {
    const wasteState = makeFixture({
      waste: [cardId('clubs', 8)],
      tableau: [[cardId('hearts', 9)]],
    });
    const wasteMove = moveCards(wasteState, { type: 'waste' }, tableau(0));
    expect(wasteMove.ok).toBe(true);
    if (wasteMove.ok) {
      expect(wasteMove.transaction.scoreDelta).toBe(5);
      expect(wasteMove.state.score).toBe(5);
    }

    const foundationState = makeFixture({
      tableau: [[{ id: cardId('diamonds', 5), faceUp: false }, cardId('spades', 1)]],
    });
    const foundationMove = autoMoveToFoundation(foundationState, tableau(0));
    expect(foundationMove.ok).toBe(true);
    if (foundationMove.ok) {
      expect(foundationMove.transaction.scoreDelta).toBe(15);
      expect(foundationMove.state.score).toBe(15);
      expect(foundationMove.state.cards[cardId('diamonds', 5)].faceUp).toBe(true);
    }
  });

  it('applies the zero floor but undo restores the exact prior score and count', () => {
    const initial = makeFixture({
      foundations: { spades: [cardId('spades', 1), cardId('spades', 2)] },
      tableau: [[cardId('hearts', 3)]],
      score: 10,
      moves: 4,
    });
    const moved = moveCards(initial, { type: 'foundation', suit: 'spades' }, tableau(0));
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.transaction.scoreDelta).toBe(-10);
    expect(moved.state.score).toBe(0);
    expect(moved.state.moves).toBe(5);
    const restored = undo(moved.state);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.state.score).toBe(10);
      expect(restored.state.moves).toBe(4);
      expect(liveSnapshot(restored.state)).toBe(liveSnapshot(initial));
    }

    const floor = makeFixture({
      foundations: { spades: [cardId('spades', 1), cardId('spades', 2)] },
      tableau: [[cardId('hearts', 3)]],
      score: 0,
    });
    const toZero = moveCards(floor, { type: 'foundation', suit: 'spades' }, tableau(0));
    expect(toZero.ok).toBe(true);
    if (toZero.ok) {
      expect(toZero.state.score).toBe(0);
      expect(toZero.transaction.scoreDelta).toBe(0);
    }
  });

  it('tracks score even in relaxed mode and allows the preference to change', () => {
    const initial = makeFixture({
      scoringMode: 'relaxed',
      waste: [cardId('clubs', 8)],
      tableau: [[cardId('hearts', 9)]],
    });
    const moved = moveCards(initial, { type: 'waste' }, tableau(0));
    if (!moved.ok) throw new Error('Expected legal score move');
    expect(moved.state.score).toBe(5);
    expect(moved.state.scoringMode).toBe('relaxed');
    const scored = setScoringMode(moved.state, 'scored');
    expect(scored.score).toBe(5);
    expect(scored.scoringMode).toBe('scored');
    expect(moved.state.scoringMode).toBe('relaxed');
    expect(scored.history).toHaveLength(1);
    const restored = undo(scored);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.state.scoringMode).toBe('scored');
      expect(restored.state.score).toBe(0);
      expect(restored.state.waste).toEqual(initial.waste);
    }
  });
});

describe('restart', () => {
  it('reproduces the original seed/deal and resets all progress and metadata', () => {
    const initial = createGame('restart-seed', 3, 'scored');
    const firstDraw = drawStock(initial);
    if (!firstDraw.ok) throw new Error(firstDraw.error.message);
    const progressed = cloneGameState(firstDraw.state);
    progressed.elapsedMs = 999;
    const restarted = restartGame(progressed);
    expect(restarted).toEqual(initial);
    expect(restarted.history).toEqual([]);
    expect(restarted.elapsedMs).toBe(0);
    expect(restarted.moves).toBe(0);
    expect(restarted.score).toBe(0);
    expect(validateState(restarted).valid).toBe(true);
  });
});
