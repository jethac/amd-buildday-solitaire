import { describe, expect, it } from 'vitest';
import {
  applyAutoComplete,
  autoMoveToFoundation,
  isWon,
  planAutoComplete,
  SUITS,
  undo,
  validateState,
  type AutoCompletePlan,
  type CardId,
  type DrawMode,
  type GameState,
  type Suit,
} from '../../src/game';
import { cardId, foundationThrough, makeFixture } from './helpers';

function foundationsThrough(rank: number): Record<Suit, CardId[]> {
  return {
    spades: foundationThrough('spades', rank),
    hearts: foundationThrough('hearts', rank),
    clubs: foundationThrough('clubs', rank),
    diamonds: foundationThrough('diamonds', rank),
  };
}

function kingsForStock(): CardId[] {
  return [
    cardId('hearts', 13),
    cardId('spades', 13),
    cardId('diamonds', 13),
    cardId('clubs', 13),
  ];
}

describe('ordinary victory', () => {
  it('detects exactly four full foundations after a normal move and undoes it cleanly', () => {
    const foundations = foundationsThrough(13);
    foundations.spades = foundationThrough('spades', 12);
    const initial = makeFixture({
      foundations,
      stock: [],
      tableau: [[cardId('spades', 13)]],
    });
    expect(validateState(initial).valid).toBe(true);
    expect(isWon(initial)).toBe(false);
    const moved = autoMoveToFoundation(initial, { type: 'tableau', index: 0 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(isWon(moved.state)).toBe(true);
    expect(moved.state.status).toBe('won');
    expect(moved.state.score).toBe(10);
    expect(moved.state.moves).toBe(1);
    expect(validateState(moved.state).valid).toBe(true);

    const restored = undo(moved.state);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(isWon(restored.state)).toBe(false);
      expect(restored.state).toEqual(initial);
    }
  });
});

describe('automatic completion', () => {
  it.each([1, 3] as DrawMode[])('plans legal stock/waste/foundation actions and applies Draw %s atomically', (drawMode) => {
    const initial: GameState = makeFixture({
      drawMode,
      foundations: foundationsThrough(12),
      stock: kingsForStock(),
    });
    expect(validateState(initial).valid).toBe(true);
    const planned = planAutoComplete(initial);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.actions.some((action) => action.kind === 'draw-stock')).toBe(true);
    expect(planned.plan.actions.filter((action) => action.kind === 'move-to-foundation')).toHaveLength(4);

    const completed = applyAutoComplete(initial, planned.plan);
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(isWon(completed.state)).toBe(true);
    expect(completed.state.status).toBe('won');
    expect(completed.state.stock).toEqual([]);
    expect(completed.state.waste).toEqual([]);
    expect(completed.state.score).toBe(40);
    const drawActions = Math.ceil(4 / drawMode);
    expect(completed.state.moves).toBe(drawActions + 4);
    expect(completed.state.history).toHaveLength(1);
    expect(completed.transaction).toMatchObject({
      kind: 'auto-complete',
      scoreDelta: 40,
      moveCountDelta: drawActions + 4,
    });
    if (completed.transaction.kind === 'auto-complete') {
      expect(completed.transaction.steps).toHaveLength(drawActions + 4);
      expect(completed.transaction.steps.filter((step) => step.kind === 'move')).toHaveLength(4);
    }
    expect(validateState(completed.state).valid).toBe(true);

    const restored = undo(completed.state);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state).toEqual(initial);
  });

  it('rejects hidden-tableau planning, stale plans, and incomplete plans without effects', () => {
    const hidden = makeFixture({
      tableau: [[{ id: cardId('spades', 1), faceUp: false }]],
    });
    const noPlan = planAutoComplete(hidden);
    expect(noPlan.ok).toBe(false);
    if (!noPlan.ok) {
      expect(noPlan.error.code).toBe('AUTO_COMPLETE_HIDDEN_CARDS');
      expect(noPlan.state).toBe(hidden);
    }

    const initial = makeFixture({
      foundations: foundationsThrough(12),
      stock: kingsForStock(),
    });
    const planned = planAutoComplete(initial);
    if (!planned.ok) throw new Error('Expected a completion plan');
    const moveIndex = planned.plan.actions.findIndex((action) => action.kind === 'move-to-foundation');
    const stale: AutoCompletePlan = {
      ...planned.plan,
      actions: planned.plan.actions.map((action, index) =>
        index === moveIndex && action.kind === 'move-to-foundation'
          ? { ...action, cardId: cardId('hearts', 4) }
          : action,
      ),
    };
    const rejected = applyAutoComplete(initial, stale);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe('INVALID_AUTO_COMPLETE_PLAN');
      expect(rejected.state).toBe(initial);
    }

    const incomplete = applyAutoComplete(initial, { ...planned.plan, actions: [] });
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) expect(incomplete.error.code).toBe('INCOMPLETE_AUTO_COMPLETE');
    expect(initial.history).toEqual([]);
    expect(initial.moves).toBe(0);
    expect(initial.score).toBe(0);
  });

  it('applies a legal recycle within the same completion undo transaction', () => {
    const foundations = foundationsThrough(13);
    foundations.spades = foundationThrough('spades', 12);
    const initial = makeFixture({
      foundations,
      stock: [cardId('spades', 13)],
    });
    const planned = planAutoComplete(initial);
    if (!planned.ok) throw new Error('Expected a one-card stock plan');
    const withRecycle: AutoCompletePlan = {
      ...planned.plan,
      actions: [{ kind: 'draw-stock' }, { kind: 'recycle-stock' }, ...planned.plan.actions],
    };
    const completed = applyAutoComplete(initial, withRecycle);
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.state.moves).toBe(4);
    expect(completed.state.history).toHaveLength(1);
    expect(completed.transaction.kind).toBe('auto-complete');
    if (completed.transaction.kind === 'auto-complete') {
      expect(completed.transaction.steps.map((step) => step.kind)).toEqual([
        'draw', 'recycle', 'draw', 'move',
      ]);
    }
    const restored = undo(completed.state);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state).toEqual(initial);
  });

  it('can complete a single exposed card without requiring a stock action', () => {
    const foundations = foundationsThrough(13);
    foundations.diamonds = foundationThrough('diamonds', 12);
    const state = makeFixture({
      foundations,
      stock: [],
      tableau: [[cardId('diamonds', 13)]],
    });
    const plan = planAutoComplete(state);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.plan.actions).toEqual([
        {
          kind: 'move-to-foundation',
          source: { type: 'tableau', index: 0 },
          cardId: cardId('diamonds', 13),
        },
      ]);
    }
    expect(SUITS.every((suit) => state.foundations[suit].length > 0)).toBe(true);
  });
});
