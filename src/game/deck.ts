import {
  SUITS,
  type Card,
  type CardColor,
  type CardId,
  type DrawMode,
  type GameState,
  type NewGameOptions,
  type Rank,
  type ScoringMode,
  type Seed,
  type Suit,
} from './types';

export const STATE_SCHEMA_VERSION = 1;
/** Version 1: FNV-1a (UTF-16 code units) + Mulberry32 + descending Fisher-Yates. */
export const DEAL_VERSION = 1;

export function getCardId(suit: Suit, rank: Rank): CardId {
  return `${suit}-${rank}`;
}

export function getCardColor(suit: Suit): CardColor {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

/** Creates a fresh deck in suit/rank order. No card objects are shared between decks. */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      const typedRank = rank as Rank;
      cards.push({
        id: getCardId(suit, typedRank),
        suit,
        rank: typedRank,
        color: getCardColor(suit),
        faceUp: false,
      });
    }
  }
  return cards;
}

/** FNV-1a over JavaScript UTF-16 code units, with an explicit version prefix. */
export function hashSeed(seed: string, dealVersion: number = DEAL_VERSION): number {
  const text = `klondike-deal-v${dealVersion}:${seed}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A stable 32-bit PRNG. The dealt game never uses Math.random. */
function createMulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a shuffled copy and never mutates the supplied array. */
export function seededShuffle<T>(
  items: readonly T[],
  seed: Seed,
  dealVersion: number = DEAL_VERSION,
): T[] {
  const shuffled = items.slice();
  const random = createMulberry32(hashSeed(String(seed), dealVersion));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const held = shuffled[index] as T;
    shuffled[index] = shuffled[target] as T;
    shuffled[target] = held;
  }
  return shuffled;
}

export function createGame(
  seed: Seed,
  drawMode: DrawMode = 1,
  scoringMode: ScoringMode = 'relaxed',
): GameState {
  const deck = seededShuffle(createDeck(), seed, DEAL_VERSION);
  const tableau: CardId[][] = Array.from({ length: 7 }, () => []);
  const cards: Record<CardId, Card> = {};

  for (const card of deck) {
    cards[card.id] = card;
  }

  // Round-robin dealing gives column N exactly N cards in bottom-to-top order.
  let cursor = 0;
  for (let row = 0; row < 7; row += 1) {
    for (let column = row; column < 7; column += 1) {
      const card = deck[cursor] as Card;
      (tableau[column] as CardId[]).push(card.id);
      cursor += 1;
    }
  }

  for (const column of tableau) {
    const topId = column[column.length - 1] as CardId;
    (cards[topId] as Card).faceUp = true;
  }

  const stock = deck.slice(cursor).map((card) => card.id);
  for (const id of stock) {
    (cards[id] as Card).faceUp = false;
  }

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    dealVersion: DEAL_VERSION,
    seed: String(seed),
    drawMode,
    scoringMode,
    cards,
    stock,
    waste: [],
    foundations: {
      spades: [],
      hearts: [],
      clubs: [],
      diamonds: [],
    },
    tableau,
    moves: 0,
    score: 0,
    elapsedMs: 0,
    status: 'playing',
    history: [],
  };
}

/** Explicitly named counterpart to createGame for callers that prefer deal terminology. */
export function createSeededDeal(
  seed: Seed,
  drawMode: DrawMode = 1,
  scoringMode: ScoringMode = 'relaxed',
): GameState {
  return createGame(seed, drawMode, scoringMode);
}

export function newGame(options: NewGameOptions): GameState {
  return createGame(
    options.seed,
    options.drawMode ?? 1,
    options.scoringMode ?? 'relaxed',
  );
}
