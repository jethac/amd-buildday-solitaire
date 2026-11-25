import { createGame } from './deck';
import type {
  AutoCompleteTransaction,
  Card,
  CardId,
  DrawTransaction,
  GameSnapshot,
  GameState,
  HistoryEntry,
  MoveTransaction,
  PileRef,
  RecycleTransaction,
  ScoringMode,
  Transaction,
  UndoResult,
} from './types';

function clonePileRef(ref: PileRef): PileRef {
  switch (ref.type) {
    case 'stock':
    case 'waste':
      return { type: ref.type };
    case 'foundation':
      return { type: 'foundation', suit: ref.suit };
    case 'tableau':
      return { type: 'tableau', index: ref.index };
  }
}

function cloneCards(cards: Record<CardId, Card>): Record<CardId, Card> {
  const copy: Record<CardId, Card> = {};
  for (const [id, card] of Object.entries(cards)) {
    copy[id] = { ...card };
  }
  return copy;
}

export function snapshotState(state: GameState): GameSnapshot {
  return {
    schemaVersion: state.schemaVersion,
    dealVersion: state.dealVersion,
    seed: state.seed,
    drawMode: state.drawMode,
    scoringMode: state.scoringMode,
    cards: cloneCards(state.cards),
    stock: state.stock.slice(),
    waste: state.waste.slice(),
    foundations: {
      spades: state.foundations.spades.slice(),
      hearts: state.foundations.hearts.slice(),
      clubs: state.foundations.clubs.slice(),
      diamonds: state.foundations.diamonds.slice(),
    },
    tableau: state.tableau.map((column) => column.slice()),
    moves: state.moves,
    score: state.score,
    elapsedMs: state.elapsedMs,
    status: state.status,
  };
}

function moveFromSnapshot(snapshot: GameSnapshot): Omit<GameState, 'history'> {
  return {
    ...snapshot,
    cards: cloneCards(snapshot.cards),
    stock: snapshot.stock.slice(),
    waste: snapshot.waste.slice(),
    foundations: {
      spades: snapshot.foundations.spades.slice(),
      hearts: snapshot.foundations.hearts.slice(),
      clubs: snapshot.foundations.clubs.slice(),
      diamonds: snapshot.foundations.diamonds.slice(),
    },
    tableau: snapshot.tableau.map((column) => column.slice()),
  };
}

function cloneDraw(transaction: DrawTransaction): DrawTransaction {
  return { ...transaction, cardIds: transaction.cardIds.slice() };
}

function cloneRecycle(transaction: RecycleTransaction): RecycleTransaction {
  return { ...transaction, cardIds: transaction.cardIds.slice() };
}

function cloneMove(transaction: MoveTransaction): MoveTransaction {
  return {
    ...transaction,
    source: clonePileRef(transaction.source),
    destination: clonePileRef(transaction.destination),
    cardIds: transaction.cardIds.slice(),
  };
}

function cloneStep(
  transaction: DrawTransaction | RecycleTransaction | MoveTransaction,
): DrawTransaction | RecycleTransaction | MoveTransaction {
  switch (transaction.kind) {
    case 'draw':
      return cloneDraw(transaction);
    case 'recycle':
      return cloneRecycle(transaction);
    case 'move':
      return cloneMove(transaction);
  }
}

export function cloneTransaction(transaction: Transaction): Transaction {
  switch (transaction.kind) {
    case 'draw':
      return cloneDraw(transaction);
    case 'recycle':
      return cloneRecycle(transaction);
    case 'move':
      return cloneMove(transaction);
    case 'auto-complete': {
      const autoComplete: AutoCompleteTransaction = {
        ...transaction,
        steps: transaction.steps.map(cloneStep),
      };
      return autoComplete;
    }
  }
}

function cloneHistoryEntry(entry: HistoryEntry): HistoryEntry {
  const snapshot = entry.snapshot;
  return {
    snapshot: {
      ...snapshot,
      cards: cloneCards(snapshot.cards),
      stock: snapshot.stock.slice(),
      waste: snapshot.waste.slice(),
      foundations: {
        spades: snapshot.foundations.spades.slice(),
        hearts: snapshot.foundations.hearts.slice(),
        clubs: snapshot.foundations.clubs.slice(),
        diamonds: snapshot.foundations.diamonds.slice(),
      },
      tableau: snapshot.tableau.map((column) => column.slice()),
    },
    transaction: cloneTransaction(entry.transaction),
  };
}

/** A fully independent clone, useful for controlled previews and test fixtures. */
export function cloneGameState(state: GameState): GameState {
  return {
    ...snapshotState(state),
    history: state.history.map(cloneHistoryEntry),
  };
}

/** Clones only live board data. Committed history is treated as immutable. */
export function cloneBoardForAction(state: GameState): GameState {
  return {
    ...snapshotState(state),
    history: state.history,
  };
}

/** Adds one atomic entry. Live piles and snapshots never share arrays. */
export function commitTransaction(
  previous: GameState,
  next: GameState,
  transaction: Transaction,
): GameState {
  next.history = [
    ...previous.history.map(cloneHistoryEntry),
    {
      snapshot: snapshotState(previous),
      transaction: cloneTransaction(transaction),
    },
  ];
  return next;
}

export function undo(state: GameState): UndoResult {
  const entry = state.history[state.history.length - 1];
  if (!entry) {
    return {
      ok: false,
      state,
      error: {
        code: 'NOTHING_TO_UNDO',
        message: 'There is no action to undo.',
        details: {},
      },
    };
  }

  return {
    ok: true,
    state: {
      ...moveFromSnapshot(entry.snapshot),
      // Undo never turns back active play time or changes a visibility preference.
      elapsedMs: state.elapsedMs,
      scoringMode: state.scoringMode,
      history: state.history.slice(0, -1).map(cloneHistoryEntry),
    },
    undone: cloneTransaction(entry.transaction),
  };
}

export function restartGame(state: GameState): GameState {
  return createGame(state.seed, state.drawMode, state.scoringMode);
}

/** Score tracking remains active in both preferences; this changes display preference only. */
export function setScoringMode(state: GameState, scoringMode: ScoringMode): GameState {
  const next = cloneGameState(state);
  next.scoringMode = scoringMode;
  return next;
}
