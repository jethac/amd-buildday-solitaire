/** The four suits in their stable display and serialization order. */
export const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'] as const;

export type Suit = (typeof SUITS)[number];
export type CardColor = 'black' | 'red';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type CardId = string;
export type DrawMode = 1 | 3;
export type ScoringMode = 'scored' | 'relaxed';
export type GameStatus = 'dealing' | 'playing' | 'auto-completing' | 'won';
export type Seed = string | number;

export interface Card {
  /** Stable across deals: "<suit>-<rank>". */
  readonly id: CardId;
  readonly suit: Suit;
  readonly rank: Rank;
  readonly color: CardColor;
  faceUp: boolean;
}

/** Pile arrays are always ordered from bottom to top. */
export type PileRef =
  | { readonly type: 'stock' }
  | { readonly type: 'waste' }
  | { readonly type: 'foundation'; readonly suit: Suit }
  | { readonly type: 'tableau'; readonly index: number };

/** All data except undo history. This is the exact snapshot restored by undo. */
export interface GameSnapshot {
  schemaVersion: number;
  dealVersion: number;
  seed: string;
  drawMode: DrawMode;
  scoringMode: ScoringMode;
  cards: Record<CardId, Card>;
  stock: CardId[];
  waste: CardId[];
  foundations: Record<Suit, CardId[]>;
  tableau: CardId[][];
  moves: number;
  score: number;
  elapsedMs: number;
  status: GameStatus;
}

interface TransactionBase {
  /** The actual score change after applying the zero floor. */
  scoreDelta: number;
  moveCountDelta: number;
}

export interface DrawTransaction extends TransactionBase {
  kind: 'draw';
  /** Cards in transfer order; the last ID is the new top of waste. */
  cardIds: CardId[];
}

export interface RecycleTransaction extends TransactionBase {
  kind: 'recycle';
  /** The new stock order, from bottom to top. */
  cardIds: CardId[];
}

export interface MoveTransaction extends TransactionBase {
  kind: 'move';
  source: PileRef;
  destination: PileRef;
  /** Moved suffix in bottom-to-top order. */
  cardIds: CardId[];
  revealedCardId: CardId | null;
}

export interface AutoCompleteTransaction extends TransactionBase {
  kind: 'auto-complete';
  steps: Array<DrawTransaction | RecycleTransaction | MoveTransaction>;
}

export type Transaction =
  | DrawTransaction
  | RecycleTransaction
  | MoveTransaction
  | AutoCompleteTransaction;

export interface HistoryEntry {
  /** A deep snapshot; it deliberately contains no nested history. */
  snapshot: GameSnapshot;
  transaction: Transaction;
}

export interface GameState extends GameSnapshot {
  /** Oldest transaction first. Every entry is JSON-serializable. */
  history: HistoryEntry[];
}

export type RejectionCode =
  | 'INVALID_STATE'
  | 'INVALID_PILE'
  | 'GAME_NOT_PLAYING'
  | 'ALREADY_WON'
  | 'STOCK_EMPTY'
  | 'STOCK_NOT_EMPTY'
  | 'WASTE_EMPTY'
  | 'SOURCE_NOT_PLAYABLE'
  | 'DESTINATION_NOT_PLAYABLE'
  | 'SAME_PILE'
  | 'NO_CARDS'
  | 'INVALID_START_INDEX'
  | 'CARD_NOT_TOP'
  | 'CARD_FACE_DOWN'
  | 'INVALID_TABLEAU_STACK'
  | 'ILLEGAL_TABLEAU_MOVE'
  | 'KING_REQUIRED'
  | 'MULTI_CARD_FOUNDATION_MOVE'
  | 'ILLEGAL_FOUNDATION_MOVE'
  | 'NOTHING_TO_UNDO'
  | 'AUTO_COMPLETE_HIDDEN_CARDS'
  | 'NO_AUTO_COMPLETE'
  | 'INVALID_AUTO_COMPLETE_PLAN'
  | 'INCOMPLETE_AUTO_COMPLETE';

export type RejectionDetails = Record<string, string | number | boolean | null>;

export interface ActionRejection {
  code: RejectionCode;
  message: string;
  details: RejectionDetails;
}

export interface ActionSuccess {
  ok: true;
  state: GameState;
  transaction: Transaction;
}

export interface ActionFailure {
  ok: false;
  /** The exact input reference is returned on rejection. */
  state: GameState;
  error: ActionRejection;
}

export type ActionResult = ActionSuccess | ActionFailure;

export interface UndoSuccess {
  ok: true;
  state: GameState;
  undone: Transaction;
}

export interface UndoFailure {
  ok: false;
  state: GameState;
  error: ActionRejection;
}

export type UndoResult = UndoSuccess | UndoFailure;

export interface NewGameOptions {
  seed: Seed;
  drawMode?: DrawMode;
  scoringMode?: ScoringMode;
}

export interface MoveIntent {
  kind: 'move';
  source: PileRef;
  destination: PileRef;
  /** Null means the source's top card. */
  startIndex: number | null;
}

export type LegalAction =
  | MoveIntent
  | { kind: 'draw-stock' }
  | { kind: 'recycle-stock' };

export type HintPriority = 1 | 2 | 3 | 4 | 5;
export type HintReason =
  | 'reveal-hidden-card'
  | 'move-to-foundation'
  | 'play-waste'
  | 'productive-tableau-move'
  | 'draw-or-recycle';

interface HintBase {
  priority: HintPriority;
  reason: HintReason;
}

export type Hint =
  | (HintBase & MoveIntent)
  | (HintBase & { kind: 'draw-stock' | 'recycle-stock' });

export type AutoCompleteAction =
  | {
      kind: 'move-to-foundation';
      source: PileRef;
      cardId: CardId;
    }
  | { kind: 'draw-stock' }
  | { kind: 'recycle-stock' };

export interface AutoCompletePlan {
  readonly dealVersion: number;
  readonly seed: string;
  readonly drawMode: DrawMode;
  readonly actions: AutoCompleteAction[];
}

export interface AutoCompletePlanSuccess {
  ok: true;
  plan: AutoCompletePlan;
}

export interface AutoCompletePlanFailure {
  ok: false;
  state: GameState;
  error: ActionRejection;
}

export type AutoCompletePlanResult = AutoCompletePlanSuccess | AutoCompletePlanFailure;

export interface StateValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type StateValidationResult =
  | { valid: true; issues: [] }
  | { valid: false; issues: StateValidationIssue[] };
