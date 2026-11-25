import { DEAL_VERSION, getCardColor, getCardId, STATE_SCHEMA_VERSION } from './deck';
import { SUITS } from './types';
import type {
  CardId,
  GameState,
  Rank,
  StateValidationIssue,
  StateValidationResult,
  Suit,
} from './types';

type UnknownObject = Record<string, unknown>;

function isObject(value: unknown): value is UnknownObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: StateValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function readArray(
  value: unknown,
  path: string,
  issues: StateValidationIssue[],
): unknown[] {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'NOT_ARRAY', 'Expected an ordered card-ID array.');
    return [];
  }
  return value;
}

function validateTransaction(
  value: unknown,
  path: string,
  issues: StateValidationIssue[],
): void {
  if (!isObject(value)) {
    addIssue(issues, path, 'INVALID_TRANSACTION', 'Expected a serializable transaction object.');
    return;
  }
  if (!['draw', 'recycle', 'move', 'auto-complete'].includes(String(value.kind))) {
    addIssue(issues, `${path}.kind`, 'INVALID_TRANSACTION_KIND', 'Unknown transaction kind.');
  }
  for (const key of ['scoreDelta', 'moveCountDelta']) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
      addIssue(issues, `${path}.${key}`, 'INVALID_NUMBER', 'Transaction deltas must be finite numbers.');
    }
  }
  if (value.kind === 'move' || value.kind === 'draw' || value.kind === 'recycle') {
    readArray(value.cardIds, `${path}.cardIds`, issues);
  }
  if (value.kind === 'move') {
    if (!isObject(value.source)) {
      addIssue(issues, `${path}.source`, 'INVALID_PILE', 'Expected a source pile reference.');
    }
    if (!isObject(value.destination)) {
      addIssue(issues, `${path}.destination`, 'INVALID_PILE', 'Expected a destination pile reference.');
    }
    if (value.revealedCardId !== null && typeof value.revealedCardId !== 'string') {
      addIssue(
        issues,
        `${path}.revealedCardId`,
        'INVALID_CARD',
        'Expected a card ID or null.',
      );
    }
  }
  if (value.kind === 'auto-complete') {
    const steps = readArray(value.steps, `${path}.steps`, issues);
    steps.forEach((step, index) => validateTransaction(step, `${path}.steps[${index}]`, issues));
  }
}

/** Validates a state or history snapshot without throwing on malformed JSON data. */
function validateCore(
  value: unknown,
  basePath: string,
  issues: StateValidationIssue[],
): void {
  if (!isObject(value)) {
    addIssue(issues, basePath, 'NOT_OBJECT', 'Expected a game-state object.');
    return;
  }

  if (value.schemaVersion !== STATE_SCHEMA_VERSION) {
    addIssue(issues, `${basePath}.schemaVersion`, 'UNSUPPORTED_SCHEMA', 'Unsupported state schema version.');
  }
  if (value.dealVersion !== DEAL_VERSION) {
    addIssue(issues, `${basePath}.dealVersion`, 'UNSUPPORTED_DEAL', 'Unsupported deal version.');
  }
  if (typeof value.seed !== 'string') {
    addIssue(issues, `${basePath}.seed`, 'INVALID_SEED', 'The original seed must be a string.');
  }
  if (value.drawMode !== 1 && value.drawMode !== 3) {
    addIssue(issues, `${basePath}.drawMode`, 'INVALID_DRAW_MODE', 'Draw mode must be 1 or 3.');
  }
  if (value.scoringMode !== 'scored' && value.scoringMode !== 'relaxed') {
    addIssue(issues, `${basePath}.scoringMode`, 'INVALID_SCORING_MODE', 'Unknown scoring preference.');
  }
  if (!['dealing', 'playing', 'auto-completing', 'won'].includes(String(value.status))) {
    addIssue(issues, `${basePath}.status`, 'INVALID_STATUS', 'Unknown game status.');
  }
  if (
    typeof value.moves !== 'number' ||
    !Number.isInteger(value.moves) ||
    (value.moves as number) < 0
  ) {
    addIssue(issues, `${basePath}.moves`, 'INVALID_MOVES', 'Move count must be a non-negative integer.');
  }
  if (
    typeof value.score !== 'number' ||
    !Number.isInteger(value.score) ||
    (value.score as number) < 0
  ) {
    addIssue(issues, `${basePath}.score`, 'INVALID_SCORE', 'Score must be a non-negative integer.');
  }
  if (
    typeof value.elapsedMs !== 'number' ||
    !Number.isFinite(value.elapsedMs) ||
    (value.elapsedMs as number) < 0
  ) {
    addIssue(issues, `${basePath}.elapsedMs`, 'INVALID_ELAPSED_TIME', 'Elapsed time must be finite and non-negative.');
  }

  const cardTable = isObject(value.cards) ? value.cards : null;
  if (!cardTable) {
    addIssue(issues, `${basePath}.cards`, 'INVALID_CARD_TABLE', 'Expected a card table object.');
  } else {
    const keys = Object.keys(cardTable);
    if (keys.length !== 52) {
      addIssue(issues, `${basePath}.cards`, 'INVALID_DECK_SIZE', 'The card table must contain exactly 52 cards.');
    }
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank += 1) {
        const id = getCardId(suit, rank as Rank);
        const card = cardTable[id];
        const path = `${basePath}.cards.${id}`;
        if (!isObject(card)) {
          addIssue(issues, path, 'MISSING_CARD', 'A standard deck card is missing or malformed.');
          continue;
        }
        if (card.id !== id || card.suit !== suit || card.rank !== rank) {
          addIssue(issues, path, 'INVALID_CARD_IDENTITY', 'Card ID, suit, and rank must agree.');
        }
        if (card.color !== getCardColor(suit)) {
          addIssue(issues, path, 'INVALID_CARD_COLOR', 'Card color must agree with its suit.');
        }
        if (typeof card.faceUp !== 'boolean') {
          addIssue(issues, path, 'INVALID_FACE_STATE', 'Card faceUp must be boolean.');
        }
      }
    }
  }

  const stock = readArray(value.stock, `${basePath}.stock`, issues);
  const waste = readArray(value.waste, `${basePath}.waste`, issues);
  const tableauValue = readArray(value.tableau, `${basePath}.tableau`, issues);
  if (tableauValue.length !== 7) {
    addIssue(issues, `${basePath}.tableau`, 'INVALID_TABLEAU_SIZE', 'Exactly seven tableau columns are required.');
  }
  const tableau = Array.from({ length: 7 }, (_, index) =>
    readArray(tableauValue[index], `${basePath}.tableau[${index}]`, issues),
  );

  const foundationObject = isObject(value.foundations) ? value.foundations : null;
  if (!foundationObject) {
    addIssue(issues, `${basePath}.foundations`, 'INVALID_FOUNDATIONS', 'Expected four foundation piles.');
  }
  const foundations = {} as Record<Suit, unknown[]>;
  for (const suit of SUITS) {
    foundations[suit] = readArray(
      foundationObject?.[suit],
      `${basePath}.foundations.${suit}`,
      issues,
    );
  }

  const allPiles: Array<{ ids: unknown[]; path: string }> = [
    { ids: stock, path: `${basePath}.stock` },
    { ids: waste, path: `${basePath}.waste` },
    ...tableau.map((ids, index) => ({ ids, path: `${basePath}.tableau[${index}]` })),
    ...SUITS.map((suit) => ({
      ids: foundations[suit],
      path: `${basePath}.foundations.${suit}`,
    })),
  ];
  const occurrences = new Map<CardId, string[]>();
  for (const pile of allPiles) {
    pile.ids.forEach((id, index) => {
      const path = `${pile.path}[${index}]`;
      if (typeof id !== 'string') {
        addIssue(issues, path, 'INVALID_CARD_ID', 'Pile entries must be card IDs.');
        return;
      }
      if (!cardTable || !isObject(cardTable[id])) {
        addIssue(issues, path, 'UNKNOWN_CARD', 'The pile references an unknown card.');
      }
      const paths = occurrences.get(id) ?? [];
      paths.push(path);
      occurrences.set(id, paths);
    });
  }
  for (const [id, paths] of occurrences) {
    if (paths.length > 1) {
      addIssue(
        issues,
        paths[1] as string,
        'DUPLICATE_CARD',
        `Card ${id} occurs in more than one pile: ${paths.join(', ')}.`,
      );
    }
  }
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      const id = getCardId(suit, rank as Rank);
      if (!occurrences.has(id)) {
        addIssue(issues, basePath, 'CARD_NOT_IN_PILE', `Card ${id} does not occur in any pile.`);
      }
    }
  }

  stock.forEach((id, index) => {
    const card = typeof id === 'string' && cardTable ? cardTable[id] : null;
    if (isObject(card) && card.faceUp !== false) {
      addIssue(issues, `${basePath}.stock[${index}]`, 'STOCK_FACE_UP', 'Stock cards must be face-down.');
    }
  });
  waste.forEach((id, index) => {
    const card = typeof id === 'string' && cardTable ? cardTable[id] : null;
    if (isObject(card) && card.faceUp !== true) {
      addIssue(issues, `${basePath}.waste[${index}]`, 'WASTE_FACE_DOWN', 'Waste cards must be face-up.');
    }
  });

  tableau.forEach((column, columnIndex) => {
    let hasSeenFaceUp = false;
    let previousFaceUpId: string | null = null;
    column.forEach((id, cardIndex) => {
      const path = `${basePath}.tableau[${columnIndex}][${cardIndex}]`;
      if (typeof id !== 'string') {
        hasSeenFaceUp = true;
        previousFaceUpId = null;
        return;
      }
      const card = cardTable ? cardTable[id] : null;
      if (!isObject(card) || typeof card.faceUp !== 'boolean') {
        hasSeenFaceUp = true;
        previousFaceUpId = null;
        return;
      }
      if (card.faceUp) {
        hasSeenFaceUp = true;
        if (previousFaceUpId && cardTable) {
          const previous = cardTable[previousFaceUpId];
          if (
            isObject(previous) &&
            (previous.rank !== (card.rank as number) + 1 || previous.color === card.color)
          ) {
            addIssue(
              issues,
              path,
              'INVALID_TABLEAU_RUN',
              'Face-up tableau runs must descend in alternating colors.',
            );
          }
        }
        previousFaceUpId = id;
      } else {
        if (hasSeenFaceUp) {
          addIssue(
            issues,
            path,
            'INVALID_TABLEAU_FACE_ORDER',
            'All face-down tableau cards must precede all face-up cards.',
          );
        }
        previousFaceUpId = null;
      }
    });
  });

  for (const suit of SUITS) {
    foundations[suit].forEach((id, index) => {
      const path = `${basePath}.foundations.${suit}[${index}]`;
      const card = typeof id === 'string' && cardTable ? cardTable[id] : null;
      if (!isObject(card)) return;
      if (card.faceUp !== true) {
        addIssue(issues, path, 'FOUNDATION_FACE_DOWN', 'Foundation cards must be face-up.');
      }
      if (card.suit !== suit || card.rank !== index + 1) {
        addIssue(
          issues,
          path,
          'INVALID_FOUNDATION_RUN',
          'Each foundation must contain one suit in uninterrupted Ace-to-rank order.',
        );
      }
    });
  }

  const foundationsFull = SUITS.every((suit) => foundations[suit].length === 13);
  if (foundationsFull && value.status !== 'won') {
    addIssue(issues, `${basePath}.status`, 'VICTORY_STATUS_MISMATCH', 'Full foundations require won status.');
  }
  if (!foundationsFull && value.status === 'won') {
    addIssue(issues, `${basePath}.status`, 'VICTORY_STATUS_MISMATCH', 'Won status requires four full foundations.');
  }
}

/**
 * Checks the live state, all 52 identities, pile placement, face states, ordered runs,
 * victory status, and every undo snapshot. Safe to call on unknown saved JSON.
 */
export function validateState(state: unknown): StateValidationResult {
  const issues: StateValidationIssue[] = [];
  validateCore(state, '$', issues);

  if (!isObject(state)) {
    return { valid: false, issues };
  }
  if (!Array.isArray(state.history)) {
    addIssue(issues, '$.history', 'INVALID_HISTORY', 'History must be an array.');
  } else {
    state.history.forEach((entry, index) => {
      const path = `$.history[${index}]`;
      if (!isObject(entry)) {
        addIssue(issues, path, 'INVALID_HISTORY_ENTRY', 'Expected an undo entry object.');
        return;
      }
      validateCore(entry.snapshot, `${path}.snapshot`, issues);
      validateTransaction(entry.transaction, `${path}.transaction`, issues);
      if (isObject(entry.snapshot)) {
        for (const key of ['schemaVersion', 'dealVersion', 'seed', 'drawMode'] as const) {
          if (entry.snapshot[key] !== state[key]) {
            addIssue(
              issues,
              `${path}.snapshot.${key}`,
              'HISTORY_RULE_MISMATCH',
              'Undo snapshots must belong to the same deal and rules.',
            );
          }
        }
      }
    });
  }

  return issues.length === 0
    ? { valid: true, issues: [] }
    : { valid: false, issues };
}

export function isValidGameState(state: unknown): state is GameState {
  return validateState(state).valid;
}
