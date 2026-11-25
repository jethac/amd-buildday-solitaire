import { cloneBoardForAction, commitTransaction } from './history';
import {
  getPileCards,
  validateMove,
} from './rules';
import { applyScoreFloor, calculateMoveScore } from './scoring';
import { SUITS } from './types';
import type {
  ActionRejection,
  ActionResult,
  CardId,
  DrawTransaction,
  GameState,
  MoveTransaction,
  PileRef,
  RejectionCode,
  RecycleTransaction,
} from './types';

function failure(
  state: GameState,
  code: RejectionCode,
  message: string,
  details: ActionRejection['details'] = {},
): ActionResult {
  return { ok: false, state, error: { code, message, details } };
}

function ensurePlaying(state: GameState): ActionResult | null {
  if (state.status !== 'playing') {
    return failure(
      state,
      state.status === 'won' ? 'ALREADY_WON' : 'GAME_NOT_PLAYING',
      state.status === 'won'
        ? 'This deal is already won; undo or start another game.'
        : 'The game is not accepting ordinary moves right now.',
    );
  }
  return null;
}

function finish(
  previous: GameState,
  next: GameState,
  transaction: DrawTransaction | RecycleTransaction | MoveTransaction,
): ActionResult {
  next.status = SUITS.every((suit) => next.foundations[suit].length === 13)
    ? 'won'
    : 'playing';
  return {
    ok: true,
    state: commitTransaction(previous, next, transaction),
    transaction,
  };
}

/** True exactly when all four foundations contain thirteen cards. */
export function isWon(state: GameState): boolean {
  return SUITS.every((suit) => state.foundations[suit].length === 13);
}

/** Draws one or up to three cards, one at a time, without automatic recycling. */
export function drawStock(state: GameState): ActionResult {
  const statusFailure = ensurePlaying(state);
  if (statusFailure) return statusFailure;
  if (state.stock.length === 0) {
    return failure(
      state,
      'STOCK_EMPTY',
      state.waste.length > 0
        ? 'The stock is empty; recycle the waste instead.'
        : 'Both stock and waste are empty.',
    );
  }

  const next = cloneBoardForAction(state);
  const cardIds: CardId[] = [];
  const count = Math.min(state.drawMode, state.stock.length);
  for (let index = 0; index < count; index += 1) {
    const id = next.stock.pop() as CardId;
    next.cards[id].faceUp = true;
    next.waste.push(id);
    cardIds.push(id);
  }
  next.moves = state.moves + 1;
  const transaction: DrawTransaction = {
    kind: 'draw',
    cardIds,
    scoreDelta: 0,
    moveCountDelta: 1,
  };
  return finish(state, next, transaction);
}

/** Reverses waste into stock, exactly restoring its previous draw order. */
export function recycleStock(state: GameState): ActionResult {
  const statusFailure = ensurePlaying(state);
  if (statusFailure) return statusFailure;
  if (state.stock.length > 0) {
    return failure(state, 'STOCK_NOT_EMPTY', 'Waste can only recycle when stock is empty.');
  }
  if (state.waste.length === 0) {
    return failure(state, 'WASTE_EMPTY', 'There is no waste to recycle.');
  }

  const next = cloneBoardForAction(state);
  next.stock = state.waste.slice().reverse();
  next.waste = [];
  for (const id of next.stock) {
    next.cards[id].faceUp = false;
  }
  next.moves = state.moves + 1;
  const transaction: RecycleTransaction = {
    kind: 'recycle',
    cardIds: next.stock.slice(),
    scoreDelta: 0,
    moveCountDelta: 1,
  };
  return finish(state, next, transaction);
}

/** Moves a legal tableau suffix or one exposed waste/foundation card atomically. */
export function moveCards(
  state: GameState,
  source: PileRef,
  destination: PileRef,
  startIndex?: number | null,
): ActionResult {
  const statusFailure = ensurePlaying(state);
  if (statusFailure) return statusFailure;
  const validation = validateMove(state, source, destination, startIndex);
  if (!validation.valid) {
    return {
      ok: false,
      state,
      error: validation.error,
    };
  }

  const move = validation.move;
  const next = cloneBoardForAction(state);
  const sourcePile = getPileCards(next, source) as CardId[];
  const destinationPile = getPileCards(next, destination) as CardId[];
  const moved = sourcePile.splice(move.startIndex);
  destinationPile.push(...moved);

  let revealedCardId: CardId | null = null;
  if (source.type === 'tableau' && sourcePile.length > 0) {
    const exposedId = sourcePile[sourcePile.length - 1] as CardId;
    if (!next.cards[exposedId].faceUp) {
      next.cards[exposedId].faceUp = true;
      revealedCardId = exposedId;
    }
  }

  const requestedScore = calculateMoveScore(source, destination, revealedCardId !== null);
  const scored = applyScoreFloor(state.score, requestedScore);
  next.score = scored.score;
  next.moves = state.moves + 1;

  const transaction: MoveTransaction = {
    kind: 'move',
    source,
    destination,
    cardIds: moved.slice(),
    revealedCardId,
    scoreDelta: scored.scoreDelta,
    moveCountDelta: 1,
  };
  return finish(state, next, transaction);
}

/** Sends only the source's exposed top card to its own suit foundation. */
export function autoMoveToFoundation(state: GameState, source: PileRef): ActionResult {
  if (source.type === 'stock' || source.type === 'foundation') {
    return failure(
      state,
      'SOURCE_NOT_PLAYABLE',
      'Only an exposed tableau or waste card can auto-move to a foundation.',
    );
  }
  const pile = getPileCards(state, source);
  if (!pile) {
    return failure(state, 'INVALID_PILE', 'The source pile does not exist.');
  }
  if (pile.length === 0) {
    return failure(state, 'NO_CARDS', 'The source pile is empty.');
  }
  const id = pile[pile.length - 1] as CardId;
  const card = state.cards[id];
  if (!card) {
    return failure(state, 'INVALID_STATE', 'The source card is missing from the card table.');
  }
  return moveCards(state, source, { type: 'foundation', suit: card.suit });
}
