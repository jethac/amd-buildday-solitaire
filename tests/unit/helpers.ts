import {
  createGame,
  getCardId,
  SUITS,
  type CardId,
  type DrawMode,
  type GameState,
  type GameStatus,
  type Rank,
  type ScoringMode,
  type Suit,
} from '../../src/game';

export const cardId = getCardId;

export interface FixtureCard {
  id: CardId;
  faceUp?: boolean;
}

export type FixtureCardInput = CardId | FixtureCard;

export interface FixtureOptions {
  seed?: string;
  drawMode?: DrawMode;
  scoringMode?: ScoringMode;
  stock?: CardId[];
  waste?: CardId[];
  tableau?: FixtureCardInput[][];
  foundations?: Partial<Record<Suit, CardId[]>>;
  moves?: number;
  score?: number;
  elapsedMs?: number;
  status?: GameStatus;
}

function normalize(card: FixtureCardInput): Required<FixtureCard> {
  return typeof card === 'string' ? { id: card, faceUp: true } : { id: card.id, faceUp: card.faceUp ?? true };
}

/**
 * Builds a controlled state without losing cards. If stock is explicitly supplied,
 * all unplaced cards are put at the bottom of waste; otherwise they remain in stock.
 */
export function makeFixture(options: FixtureOptions = {}): GameState {
  const state = createGame(options.seed ?? 'unit-fixture', options.drawMode ?? 1, options.scoringMode ?? 'scored');
  for (const card of Object.values(state.cards)) card.faceUp = false;

  const tableau = Array.from({ length: 7 }, (_, index) =>
    (options.tableau?.[index] ?? []).map(normalize),
  );
  const foundations = {
    spades: options.foundations?.spades?.slice() ?? [],
    hearts: options.foundations?.hearts?.slice() ?? [],
    clubs: options.foundations?.clubs?.slice() ?? [],
    diamonds: options.foundations?.diamonds?.slice() ?? [],
  };
  const requestedWaste = options.waste?.slice() ?? [];
  const explicitlyPlaced = new Set<CardId>([
    ...(options.stock ?? []),
    ...requestedWaste,
    ...tableau.flat().map((card) => card.id),
    ...SUITS.flatMap((suit) => foundations[suit]),
  ]);

  if (explicitlyPlaced.size !== (
    (options.stock?.length ?? 0) +
    requestedWaste.length +
    tableau.reduce((count, column) => count + column.length, 0) +
    SUITS.reduce((count, suit) => count + foundations[suit].length, 0)
  )) {
    throw new Error('Fixture placed the same card more than once.');
  }

  const remaining = Object.keys(state.cards).filter((id) => !explicitlyPlaced.has(id));
  state.stock = options.stock?.slice() ?? remaining;
  state.waste = options.stock
    ? [...remaining, ...requestedWaste]
    : requestedWaste;
  state.foundations = foundations;
  state.tableau = tableau.map((column) => column.map((card) => card.id));
  state.moves = options.moves ?? 0;
  state.score = options.score ?? 0;
  state.elapsedMs = options.elapsedMs ?? 0;
  state.status = options.status ?? 'playing';
  state.history = [];

  for (const id of state.stock) state.cards[id].faceUp = false;
  for (const id of state.waste) state.cards[id].faceUp = true;
  for (const suit of SUITS) {
    for (const id of state.foundations[suit]) state.cards[id].faceUp = true;
  }
  tableau.flat().forEach((card) => {
    state.cards[card.id].faceUp = card.faceUp;
  });
  return state;
}

export function foundationThrough(suit: Suit, highestRank: number): CardId[] {
  return Array.from({ length: highestRank }, (_, index) => cardId(suit, (index + 1) as Rank));
}

export function liveSnapshot(state: GameState): string {
  const { history: _history, ...live } = state;
  void _history;
  return JSON.stringify(live);
}
