import { describe, expect, it } from 'vitest';
import {
  autoMoveToFoundation,
  getHints,
  getMovableStack,
  moveCards,
  validateState,
  type PileRef,
} from '../../src/game';
import { cardId, makeFixture } from './helpers';

const tableau = (index: number): PileRef => ({ type: 'tableau', index });
const foundation = (suit: 'spades' | 'hearts' | 'clubs' | 'diamonds'): PileRef => ({ type: 'foundation', suit });

describe('tableau movement', () => {
  it('accepts descending alternating colors and rejects same color or wrong rank atomically', () => {
    const base = makeFixture({
      tableau: [
        [cardId('clubs', 8)],
        [cardId('hearts', 9)],
        [cardId('spades', 9)],
        [cardId('hearts', 10)],
      ],
    });
    const legal = moveCards(base, tableau(0), tableau(1));
    expect(legal.ok).toBe(true);
    if (legal.ok) {
      expect(legal.state.tableau[1].slice(-2)).toEqual([cardId('hearts', 9), cardId('clubs', 8)]);
      expect(legal.state.moves).toBe(1);
      expect(legal.transaction.moveCountDelta).toBe(1);
    }

    const cases = [
      { destination: tableau(2), code: 'ILLEGAL_TABLEAU_MOVE' },
      { destination: tableau(3), code: 'ILLEGAL_TABLEAU_MOVE' },
      { destination: tableau(0), code: 'SAME_PILE' },
      { destination: { type: 'waste' } as PileRef, code: 'DESTINATION_NOT_PLAYABLE' },
    ];
    for (const test of cases) {
      const before = base;
      const result = moveCards(base, tableau(0), test.destination);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(test.code);
        expect(result.state).toBe(before);
      }
      expect(base.moves).toBe(0);
      expect(base.history).toEqual([]);
    }
  });

  it('permits only a King or King-headed run in an empty column', () => {
    const kingState = makeFixture({ tableau: [[cardId('spades', 13)], [], [cardId('hearts', 12)]] });
    expect(moveCards(kingState, tableau(0), tableau(1)).ok).toBe(true);
    const state = makeFixture({ tableau: [[], [cardId('hearts', 12)]] });
    const result = moveCards(state, tableau(1), tableau(0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('KING_REQUIRED');
  });

  it('moves a valid multi-card suffix as one move and returns its exact stack', () => {
    const run = [cardId('spades', 8), cardId('hearts', 7), cardId('clubs', 6)];
    const state = makeFixture({ tableau: [run, [cardId('hearts', 9)]] });
    expect(getMovableStack(state, tableau(0), run[0])).toEqual(run);
    expect(getMovableStack(state, tableau(0), run[1])).toEqual(run.slice(1));
    const result = moveCards(state, tableau(0), tableau(1), 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.tableau[0]).toEqual([]);
      expect(result.state.tableau[1].slice(-3)).toEqual(run);
      expect(result.state.moves).toBe(1);
      expect(result.transaction.kind).toBe('move');
      if (result.transaction.kind === 'move') expect(result.transaction.cardIds).toEqual(run);
    }
    expect(state.tableau[1]).toEqual([cardId('hearts', 9)]);
  });

  it('rejects broken runs, face-down selections, and buried waste cards', () => {
    const broken = makeFixture({
      tableau: [[cardId('spades', 8), cardId('hearts', 6)]],
      waste: [cardId('diamonds', 4), cardId('clubs', 3)],
    });
    expect(getMovableStack(broken, tableau(0), cardId('spades', 8))).toBeNull();
    const brokenMove = moveCards(broken, tableau(0), tableau(1), 0);
    expect(brokenMove.ok).toBe(false);
    if (!brokenMove.ok) expect(brokenMove.error.code).toBe('INVALID_TABLEAU_STACK');

    const hidden = makeFixture({ tableau: [[{ id: cardId('spades', 8), faceUp: false }], [cardId('hearts', 9)]] });
    const hiddenMove = moveCards(hidden, tableau(0), tableau(1), 0);
    expect(hiddenMove.ok).toBe(false);
    if (!hiddenMove.ok) expect(hiddenMove.error.code).toBe('CARD_FACE_DOWN');

    const waste = makeFixture({ waste: [cardId('diamonds', 4), cardId('clubs', 3)], tableau: [[cardId('hearts', 4)]] });
    const buried = moveCards(waste, { type: 'waste' }, tableau(0), 0);
    expect(buried.ok).toBe(false);
    if (!buried.ok) expect(buried.error.code).toBe('CARD_NOT_TOP');
    expect(getMovableStack(waste, { type: 'waste' }, cardId('clubs', 3))).toEqual([cardId('clubs', 3)]);
  });
});

describe('foundation progression and reversal', () => {
  it('requires one suit in Ace-to-King order and only one exposed card at a time', () => {
    const state = makeFixture({
      waste: [cardId('spades', 1)],
      tableau: [[cardId('hearts', 3), cardId('clubs', 2)], [cardId('clubs', 3)]],
    });
    const wrongSuit = moveCards(state, { type: 'waste' }, foundation('hearts'));
    expect(wrongSuit.ok).toBe(false);
    const ace = autoMoveToFoundation(state, { type: 'waste' });
    expect(ace.ok).toBe(true);
    if (!ace.ok) return;
    expect(ace.state.foundations.spades).toEqual([cardId('spades', 1)]);
    expect(ace.transaction.scoreDelta).toBe(10);

    const skipped = moveCards(ace.state, tableau(1), foundation('clubs'));
    expect(skipped.ok).toBe(false);
    const multiple = moveCards(ace.state, tableau(0), foundation('hearts'), 0);
    expect(multiple.ok).toBe(false);
    if (!multiple.ok) expect(multiple.error.code).toBe('MULTI_CARD_FOUNDATION_MOVE');
  });

  it('allows only the top foundation card back to a legal tableau target', () => {
    const state = makeFixture({
      foundations: { spades: [cardId('spades', 1), cardId('spades', 2)] },
      tableau: [[cardId('hearts', 3)]],
      score: 30,
    });
    const buried = moveCards(state, foundation('spades'), tableau(0), 0);
    expect(buried.ok).toBe(false);
    if (!buried.ok) expect(buried.error.code).toBe('CARD_NOT_TOP');

    const legal = moveCards(state, foundation('spades'), tableau(0));
    expect(legal.ok).toBe(true);
    if (legal.ok) {
      expect(legal.state.tableau[0].slice(-2)).toEqual([cardId('hearts', 3), cardId('spades', 2)]);
      expect(legal.state.score).toBe(15);
      expect(legal.transaction.scoreDelta).toBe(-15);
    }
    const wrongTarget = moveCards(state, foundation('spades'), tableau(1));
    expect(wrongTarget.ok).toBe(false);
  });
});

describe('hints', () => {
  it('prioritizes reveals and omits pointless whole-King-column shuffles', () => {
    const state = makeFixture({
      tableau: [
        [{ id: cardId('diamonds', 5), faceUp: false }, cardId('clubs', 4)],
        [cardId('hearts', 5)],
        [cardId('spades', 13)],
        [],
      ],
      waste: [cardId('spades', 1)],
    });
    const hints = getHints(state);
    expect(hints[0]).toMatchObject({ priority: 1, reason: 'reveal-hidden-card' });
    expect(hints.some((hint) => hint.reason === 'move-to-foundation')).toBe(true);
    expect(hints.some((hint) => hint.kind === 'draw-stock')).toBe(true);
    expect(hints.some((hint) =>
      hint.kind === 'move' &&
      hint.source.type === 'tableau' && hint.source.index === 2 &&
      hint.destination.type === 'tableau' && hint.destination.index === 3
    )).toBe(false);
    expect(validateState(state).valid).toBe(true);
  });
});
