import { SUITS } from './types';
import type {
  ActionRejection,
  Card,
  CardId,
  GameState,
  Hint,
  LegalAction,
  PileRef,
  RejectionCode,
} from './types';

export interface ValidatedMove {
  source: PileRef;
  destination: PileRef;
  startIndex: number;
  cardIds: CardId[];
}

export type MoveValidation =
  | { valid: true; move: ValidatedMove }
  | { valid: false; error: ActionRejection };

function rejection(
  code: RejectionCode,
  message: string,
  details: ActionRejection['details'] = {},
): ActionRejection {
  return { code, message, details };
}

export function areSamePile(left: PileRef, right: PileRef): boolean {
  if (left.type !== right.type) return false;
  switch (left.type) {
    case 'stock':
    case 'waste':
      return true;
    case 'foundation':
      return right.type === 'foundation' && left.suit === right.suit;
    case 'tableau':
      return right.type === 'tableau' && left.index === right.index;
  }
}

/** Returns null for an invalid pile reference rather than throwing. */
export function getPileCards(state: GameState, ref: PileRef): CardId[] | null {
  switch (ref.type) {
    case 'stock':
      return Array.isArray(state.stock) ? state.stock : null;
    case 'waste':
      return Array.isArray(state.waste) ? state.waste : null;
    case 'foundation':
      return SUITS.includes(ref.suit) && Array.isArray(state.foundations?.[ref.suit])
        ? state.foundations[ref.suit]
        : null;
    case 'tableau':
      return Number.isInteger(ref.index) && Array.isArray(state.tableau?.[ref.index])
        ? state.tableau[ref.index]
        : null;
  }
}

function getCard(state: GameState, id: CardId): Card | null {
  return state.cards[id] ?? null;
}

function invalidMove(
  code: RejectionCode,
  message: string,
  details: ActionRejection['details'] = {},
): MoveValidation {
  return { valid: false, error: rejection(code, message, details) };
}

/**
 * Validates only move legality, without changing state or recording history.
 * startIndex applies to tableau suffixes; for waste/foundation it must be the top index.
 */
export function validateMove(
  state: GameState,
  source: PileRef,
  destination: PileRef,
  startIndex?: number | null,
): MoveValidation {
  const sourcePile = getPileCards(state, source);
  const destinationPile = getPileCards(state, destination);
  if (!sourcePile || !destinationPile) {
    return invalidMove('INVALID_PILE', 'The source or destination pile does not exist.');
  }
  if (areSamePile(source, destination)) {
    return invalidMove('SAME_PILE', 'A pile cannot be moved onto itself.');
  }
  if (source.type === 'stock') {
    return invalidMove('SOURCE_NOT_PLAYABLE', 'Stock cards must be drawn before they can move.');
  }
  if (destination.type === 'stock' || destination.type === 'waste') {
    return invalidMove(
      'DESTINATION_NOT_PLAYABLE',
      'Cards cannot be moved directly to stock or waste.',
    );
  }
  if (source.type === 'foundation' && destination.type !== 'tableau') {
    return invalidMove(
      'SOURCE_NOT_PLAYABLE',
      'Foundation cards can only move back to the tableau.',
    );
  }
  if (sourcePile.length === 0) {
    return invalidMove('NO_CARDS', 'The source pile is empty.');
  }

  const topIndex = sourcePile.length - 1;
  const actualStart = startIndex ?? topIndex;
  if (!Number.isInteger(actualStart) || actualStart < 0 || actualStart > topIndex) {
    return invalidMove('INVALID_START_INDEX', 'The requested card index is outside the source pile.', {
      startIndex: actualStart,
    });
  }
  if (source.type !== 'tableau' && actualStart !== topIndex) {
    return invalidMove('CARD_NOT_TOP', 'Only the top card of this pile can move.');
  }

  const cardIds = sourcePile.slice(actualStart);
  const firstCard = getCard(state, cardIds[0] as CardId);
  if (!firstCard) {
    return invalidMove('INVALID_STATE', 'A source card is missing from the card table.');
  }

  if (source.type === 'tableau') {
    for (let index = actualStart; index < sourcePile.length; index += 1) {
      const card = getCard(state, sourcePile[index] as CardId);
      if (!card) {
        return invalidMove('INVALID_STATE', 'A source card is missing from the card table.');
      }
      if (!card.faceUp) {
        return index === actualStart
          ? invalidMove('CARD_FACE_DOWN', 'A face-down tableau card cannot move.')
          : invalidMove('INVALID_TABLEAU_STACK', 'The selected tableau suffix contains a hidden card.');
      }
      if (index > actualStart) {
        const previous = getCard(state, sourcePile[index - 1] as CardId);
        if (
          !previous ||
          previous.rank !== card.rank + 1 ||
          previous.color === card.color
        ) {
          return invalidMove(
            'INVALID_TABLEAU_STACK',
            'A movable tableau suffix must descend in alternating colors.',
          );
        }
      }
    }
  } else if (!firstCard.faceUp) {
    return invalidMove('CARD_NOT_TOP', 'Only an exposed face-up card can move.');
  }

  if (destination.type === 'tableau') {
    if (destinationPile.length === 0) {
      if (firstCard.rank !== 13) {
        return invalidMove('KING_REQUIRED', 'Only a King or King-headed run may fill an empty column.');
      }
    } else {
      const target = getCard(state, destinationPile[destinationPile.length - 1] as CardId);
      if (!target) {
        return invalidMove('INVALID_STATE', 'The destination card is missing from the card table.');
      }
      if (
        !target.faceUp ||
        target.rank !== firstCard.rank + 1 ||
        target.color === firstCard.color
      ) {
        return invalidMove(
          'ILLEGAL_TABLEAU_MOVE',
          'Tableau cards must descend by one rank and alternate color.',
        );
      }
    }
  } else {
    if (cardIds.length !== 1) {
      return invalidMove(
        'MULTI_CARD_FOUNDATION_MOVE',
        'Only one exposed card can move to a foundation at a time.',
      );
    }
    if (destination.suit !== firstCard.suit) {
      return invalidMove(
        'ILLEGAL_FOUNDATION_MOVE',
        'A foundation accepts only cards of its own suit.',
      );
    }
    const target = destinationPile.length
      ? getCard(state, destinationPile[destinationPile.length - 1] as CardId)
      : null;
    if (destinationPile.length > 0 && !target) {
      return invalidMove('INVALID_STATE', 'The foundation card is missing from the card table.');
    }
    if (target ? target.suit !== firstCard.suit || firstCard.rank !== target.rank + 1 : firstCard.rank !== 1) {
      return invalidMove(
        'ILLEGAL_FOUNDATION_MOVE',
        'Foundations build upward by suit from Ace through King.',
      );
    }
  }

  return {
    valid: true,
    move: { source, destination, startIndex: actualStart, cardIds },
  };
}

export function canMoveCards(
  state: GameState,
  source: PileRef,
  destination: PileRef,
  startIndex?: number | null,
): boolean {
  return validateMove(state, source, destination, startIndex).valid;
}

/** Returns the exact legal suffix containing cardId, or null if it cannot be manipulated. */
export function getMovableStack(
  state: GameState,
  pileId: PileRef,
  cardId: CardId,
): CardId[] | null {
  const pile = getPileCards(state, pileId);
  if (!pile || pileId.type === 'stock') return null;
  const startIndex = pile.indexOf(cardId);
  if (startIndex < 0) return null;
  if (pileId.type !== 'tableau') {
    if (startIndex !== pile.length - 1) return null;
    const card = getCard(state, cardId);
    return card?.faceUp ? [cardId] : null;
  }

  for (let index = startIndex; index < pile.length; index += 1) {
    const card = getCard(state, pile[index] as CardId);
    if (!card?.faceUp) return null;
    if (index > startIndex) {
      const previous = getCard(state, pile[index - 1] as CardId);
      if (!previous || previous.rank !== card.rank + 1 || previous.color === card.color) {
        return null;
      }
    }
  }
  return pile.slice(startIndex);
}

/** Enumerates all currently legal card moves and stock actions, without hints filtering. */
export function enumerateLegalActions(state: GameState): LegalAction[] {
  if (state.status !== 'playing') return [];
  const actions: LegalAction[] = [];

  const addMoves = (source: PileRef, startIndex: number | null): void => {
    for (let index = 0; index < 7; index += 1) {
      const destination: PileRef = { type: 'tableau', index };
      if (validateMove(state, source, destination, startIndex).valid) {
        actions.push({ kind: 'move', source, destination, startIndex });
      }
    }

    if (source.type !== 'foundation') {
      const sourcePile = getPileCards(state, source);
      const id = startIndex === null
        ? sourcePile?.[sourcePile.length - 1]
        : sourcePile?.[startIndex];
      const card = id ? getCard(state, id) : null;
      if (card && (startIndex === null || sourcePile?.length === (startIndex ?? 0) + 1)) {
        const destination: PileRef = { type: 'foundation', suit: card.suit };
        if (validateMove(state, source, destination, startIndex).valid) {
          actions.push({ kind: 'move', source, destination, startIndex });
        }
      }
    }
  };

  for (let column = 0; column < 7; column += 1) {
    const pile = state.tableau[column] as CardId[];
    for (let startIndex = 0; startIndex < pile.length; startIndex += 1) {
      const card = getCard(state, pile[startIndex] as CardId);
      if (card?.faceUp) {
        addMoves({ type: 'tableau', index: column }, startIndex);
      }
    }
  }

  if (state.waste.length > 0) {
    addMoves({ type: 'waste' }, null);
  }

  for (const suit of SUITS) {
    if (state.foundations[suit].length > 0) {
      addMoves({ type: 'foundation', suit }, null);
    }
  }

  if (state.stock.length > 0) {
    actions.push({ kind: 'draw-stock' });
  } else if (state.waste.length > 0) {
    actions.push({ kind: 'recycle-stock' });
  }
  return actions;
}

function revealsHiddenCard(state: GameState, action: MoveIntentLike): boolean {
  if (action.source.type !== 'tableau') return false;
  const pile = state.tableau[action.source.index] as CardId[];
  const startIndex = action.startIndex ?? pile.length - 1;
  if (startIndex <= 0) return false;
  const underneath = getCard(state, pile[startIndex - 1] as CardId);
  return underneath ? !underneath.faceUp : false;
}

type MoveIntentLike = Extract<LegalAction, { kind: 'move' }>;

/** Legal hints, filtered to omit circular King shuffles and ordered by DESIGN priorities. */
export function getHints(state: GameState): Hint[] {
  const hints: Hint[] = [];

  for (const action of enumerateLegalActions(state)) {
    if (action.kind !== 'move') {
      hints.push({
        kind: action.kind,
        priority: 5,
        reason: 'draw-or-recycle',
      });
      continue;
    }

    // Reversing a foundation is legal but is not a useful automatic suggestion.
    if (action.source.type === 'foundation') continue;

    const reveals = revealsHiddenCard(state, action);
    const sourcePile = getPileCards(state, action.source);
    const startIndex = action.startIndex ?? ((sourcePile?.length ?? 1) - 1);
    const firstId = sourcePile?.[startIndex];
    const firstCard = firstId ? getCard(state, firstId) : null;

    if (
      !reveals &&
      action.source.type === 'tableau' &&
      startIndex === 0 &&
      firstCard?.rank === 13 &&
      action.destination.type === 'tableau' &&
      getPileCards(state, action.destination)?.length === 0
    ) {
      continue;
    }

    if (reveals) {
      hints.push({ ...action, priority: 1, reason: 'reveal-hidden-card' });
    } else if (action.destination.type === 'foundation') {
      hints.push({ ...action, priority: 2, reason: 'move-to-foundation' });
    } else if (action.source.type === 'waste') {
      hints.push({ ...action, priority: 3, reason: 'play-waste' });
    } else {
      hints.push({ ...action, priority: 4, reason: 'productive-tableau-move' });
    }
  }

  return hints.sort((left, right) => left.priority - right.priority);
}
