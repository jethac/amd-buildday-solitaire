import { describe, expect, it } from 'vitest';
import {
  createDeck,
  createGame,
  createSeededDeal,
  DEAL_VERSION,
  newGame,
  seededShuffle,
  SUITS,
  validateState,
} from '../../src/game';

describe('versioned seeded deck and initial deal', () => {
  it('creates every standard card exactly once with stable identities', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => card.id)).size).toBe(52);
    for (const suit of SUITS) {
      const suited = deck.filter((card) => card.suit === suit);
      expect(suited.map((card) => card.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      expect(suited.every((card) => card.id === `${suit}-${card.rank}`)).toBe(true);
      expect(suited.every((card) => card.color === (suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black'))).toBe(true);
    }
    expect(validateState(createGame('deck-check')).valid).toBe(true);
  });

  it('deals 1..7 tableau cards, exposes only each top card, and stocks 24 hidden cards', () => {
    const game = newGame({ seed: 'initial-layout' });
    expect(game.tableau).toHaveLength(7);
    expect(game.stock).toHaveLength(24);
    expect(game.waste).toEqual([]);
    expect(SUITS.every((suit) => game.foundations[suit].length === 0)).toBe(true);
    expect(game.drawMode).toBe(1);
    expect(game.scoringMode).toBe('relaxed');
    expect(game.moves).toBe(0);
    expect(game.score).toBe(0);
    expect(game.elapsedMs).toBe(0);
    expect(game.history).toEqual([]);

    game.tableau.forEach((column, index) => {
      expect(column).toHaveLength(index + 1);
      column.forEach((id, cardIndex) => {
        expect(game.cards[id].faceUp).toBe(cardIndex === column.length - 1);
      });
    });
    expect(game.stock.every((id) => !game.cards[id].faceUp)).toBe(true);
    const allIds = [...game.stock, ...game.tableau.flat()];
    expect(new Set(allIds).size).toBe(52);
  });

  it('reproduces the exact same deal for the same seed and version', () => {
    const first = createGame('repeatable-seed', 3, 'scored');
    const second = createSeededDeal('repeatable-seed', 3, 'scored');
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.cards['spades-1']).not.toBe(second.cards['spades-1']);
    expect(first.tableau[0]).not.toBe(second.tableau[0]);
    expect(first.dealVersion).toBe(DEAL_VERSION);
    expect(createGame('a-different-seed', 3, 'scored').stock).not.toEqual(first.stock);
  });

  it('shuffles without mutating its input and separates deal versions', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(seededShuffle(input, 'x', 1)).toEqual(seededShuffle(input, 'x', 1));
    expect(seededShuffle(input, 'x', 1)).not.toEqual(seededShuffle(input, 'x', 2));
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
