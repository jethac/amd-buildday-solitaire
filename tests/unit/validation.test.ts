import { describe, expect, it } from 'vitest';
import {
  cloneGameState,
  createGame,
  drawStock,
  isValidGameState,
  undo,
  validateState,
  type GameState,
} from '../../src/game';
import { cardId, makeFixture } from './helpers';

describe('serialization and state validation', () => {
  it('round-trips live board and all undo data through JSON', () => {
    const initial = createGame('json-round-trip', 3, 'scored');
    const first = drawStock(initial);
    if (!first.ok) throw new Error(first.error.message);
    const second = drawStock(first.state);
    if (!second.ok) throw new Error(second.error.message);

    const parsed: unknown = JSON.parse(JSON.stringify(second.state));
    const result = validateState(parsed);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    expect(parsed).toEqual(second.state);
    expect(isValidGameState(parsed)).toBe(true);
    if (isValidGameState(parsed)) {
      const restored = undo(parsed);
      expect(restored.ok).toBe(true);
      if (restored.ok) expect(restored.state).toEqual(first.state);
    }
  });

  it('rejects null, arrays, partial objects, and invalid primitive metadata without throwing', () => {
    for (const malformed of [null, [], {}, 'game', 42]) {
      expect(() => validateState(malformed)).not.toThrow();
      expect(validateState(malformed).valid).toBe(false);
      expect(isValidGameState(malformed)).toBe(false);
    }
    const version = cloneGameState(createGame('version'));
    version.schemaVersion = 99;
    expect(validateState(version).issues.some((issue) => issue.code === 'UNSUPPORTED_SCHEMA')).toBe(true);
    const score = cloneGameState(createGame('score'));
    score.score = -1;
    expect(validateState(score).issues.some((issue) => issue.code === 'INVALID_SCORE')).toBe(true);
  });

  it('detects duplicate, missing, and unknown cards', () => {
    const duplicate = cloneGameState(createGame('duplicate'));
    duplicate.waste.push(duplicate.stock[0]);
    const duplicateResult = validateState(duplicate);
    expect(duplicateResult.valid).toBe(false);
    expect(duplicateResult.issues.some((issue) => issue.code === 'DUPLICATE_CARD')).toBe(true);

    const missing = cloneGameState(createGame('missing')) as GameState & {
      cards: Record<string, GameState['cards'][string]>;
    };
    const removedId = missing.stock[0];
    delete missing.cards[removedId];
    const missingResult = validateState(missing);
    expect(missingResult.valid).toBe(false);
    expect(missingResult.issues.some((issue) => issue.code === 'UNKNOWN_CARD')).toBe(true);

    const unknown = cloneGameState(createGame('unknown'));
    unknown.stock[0] = 'joker-1';
    expect(validateState(unknown).issues.some((issue) => issue.code === 'UNKNOWN_CARD')).toBe(true);
  });

  it('detects malformed face order, tableau runs, foundations, and victory status', () => {
    const faceOrder = cloneGameState(createGame('face-order'));
    const column = faceOrder.tableau[6];
    faceOrder.cards[column[column.length - 2]].faceUp = true;
    faceOrder.cards[column[column.length - 1]].faceUp = false;
    expect(validateState(faceOrder).issues.some((issue) => issue.code === 'INVALID_TABLEAU_FACE_ORDER')).toBe(true);

    const run = makeFixture({
      tableau: [[cardId('spades', 8), cardId('hearts', 6)]],
    });
    expect(validateState(run).issues.some((issue) => issue.code === 'INVALID_TABLEAU_RUN')).toBe(true);

    const foundation = makeFixture({
      foundations: { spades: [cardId('spades', 2)] },
    });
    expect(validateState(foundation).issues.some((issue) => issue.code === 'INVALID_FOUNDATION_RUN')).toBe(true);

    const status = cloneGameState(createGame('status')) as GameState;
    status.status = 'won';
    expect(validateState(status).issues.some((issue) => issue.code === 'VICTORY_STATUS_MISMATCH')).toBe(true);
  });

  it('validates every undo snapshot instead of accepting corrupt hidden history', () => {
    const initial = createGame('bad-history');
    const drawn = drawStock(initial);
    if (!drawn.ok) throw new Error(drawn.error.message);
    const malformed = cloneGameState(drawn.state);
    malformed.history[0].snapshot.tableau = [];
    const result = validateState(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path.includes('snapshot') && issue.code === 'INVALID_TABLEAU_SIZE')).toBe(true);

    const wrongDeal = cloneGameState(drawn.state);
    wrongDeal.history[0].snapshot.seed = 'another-seed';
    expect(validateState(wrongDeal).issues.some((issue) => issue.code === 'HISTORY_RULE_MISMATCH')).toBe(true);
  });
});
