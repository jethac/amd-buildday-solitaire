import type { ActionResult, AppDriver, AutoCompleteResult, HintResult } from './app-driver';
import {
  applyAutoComplete,
  autoMoveToFoundation,
  canMoveCards,
  cloneGameState,
  createGame,
  drawStock,
  getHints,
  getPileCards,
  isValidGameState,
  moveCards,
  planAutoComplete,
  recycleStock,
  restartGame,
  SUITS,
  undo as engineUndo,
  type ActionResult as EngineResult,
  type AutoCompletePlan,
  type GameState,
  type Hint,
  type PileRef,
  type Suit,
} from './game';
import type { BoardCard, BoardView, Location, MoveRequest, Selection } from './ui/board';

function toRef(location: Location): PileRef | null {
  if (location.zone === 'stock') return { type: 'stock' };
  if (location.zone === 'waste') return { type: 'waste' };
  if (location.zone === 'tableau' && Number.isInteger(location.index) && location.index >= 0 && location.index < 7) {
    return { type: 'tableau', index: location.index };
  }
  if (location.zone === 'foundation' && Number.isInteger(location.index) && location.index >= 0 && location.index < 4) {
    return { type: 'foundation', suit: SUITS[location.index] };
  }
  return null;
}

function fromRef(ref: PileRef): Location {
  if (ref.type === 'foundation') return { zone: 'foundation', index: SUITS.indexOf(ref.suit) };
  if (ref.type === 'tableau') return { zone: 'tableau', index: ref.index };
  return { zone: ref.type, index: 0 };
}

function toBoardCards(state: GameState, ids: string[]): BoardCard[] {
  return ids.map((id) => {
    const card = state.cards[id];
    return { id, suit: card.suit, rank: card.rank, faceUp: card.faceUp };
  });
}

function toBoardView(state: GameState): BoardView {
  return {
    stock: toBoardCards(state, state.stock),
    waste: toBoardCards(state, state.waste),
    foundations: SUITS.map((suit) => toBoardCards(state, state.foundations[suit])),
    tableau: state.tableau.map((column) => toBoardCards(state, column)),
  };
}

export class EngineDriver implements AppDriver {
  private state: GameState = createGame('0', 1);
  private hintIndex = 0;
  private cachedPlanState: GameState | null = null;
  private cachedPlan: AutoCompletePlan | null = null;

  get view(): BoardView {
    return toBoardView(this.state);
  }

  get seed(): string {
    return this.state.seed;
  }

  get drawMode(): 1 | 3 {
    return this.state.drawMode;
  }

  get moves(): number {
    return this.state.moves;
  }

  get score(): number {
    return this.state.score;
  }

  get canUndo(): boolean {
    return this.state.history.length > 0;
  }

  get won(): boolean {
    return this.state.status === 'won';
  }

  get elapsedMs(): number {
    return this.state.elapsedMs;
  }

  get autoCompleteAvailable(): boolean {
    if (this.state.status !== 'playing') return false;
    if (this.cachedPlanState === this.state) return this.cachedPlan !== null;
    const result = planAutoComplete(this.state);
    this.cachedPlanState = this.state;
    this.cachedPlan = result.ok ? result.plan : null;
    return result.ok;
  }

  newGame(seed: string, drawMode: 1 | 3): void {
    this.state = createGame(seed, drawMode);
    this.invalidateDerived();
  }

  restore(serialized: unknown): boolean {
    if (!isValidGameState(serialized)) return false;
    this.state = cloneGameState(serialized);
    this.invalidateDerived();
    return true;
  }

  serialize(): unknown {
    return this.state;
  }

  setElapsedMs(elapsedMs: number): void {
    if (Number.isFinite(elapsedMs) && elapsedMs >= 0) this.state.elapsedMs = Math.round(elapsedMs);
  }

  restart(): void {
    this.state = restartGame(this.state);
    this.invalidateDerived();
  }

  draw(): ActionResult {
    return this.accept(this.state.stock.length > 0 ? drawStock(this.state) : recycleStock(this.state), 'Stock updated.');
  }

  move(request: MoveRequest): ActionResult {
    const source = toRef(request.source);
    const destination = toRef(request.target);
    if (!source || !destination) return this.rejection('That pile does not exist.');
    const pile = getPileCards(this.state, source);
    const startIndex = pile?.indexOf(request.cardId) ?? -1;
    if (startIndex < 0) return this.rejection('That card is no longer in the selected pile.');
    return this.accept(moveCards(this.state, source, destination, startIndex), 'Cards moved.');
  }

  canMove(request: MoveRequest): boolean {
    if (this.state.status !== 'playing') return false;
    const source = toRef(request.source);
    const destination = toRef(request.target);
    if (!source || !destination) return false;
    const pile = getPileCards(this.state, source);
    const startIndex = pile?.indexOf(request.cardId) ?? -1;
    return startIndex >= 0 && canMoveCards(this.state, source, destination, startIndex);
  }

  autoFoundation(selection: Selection): ActionResult {
    const source = toRef(selection.source);
    if (!source) return this.rejection('That pile does not exist.');
    const pile = getPileCards(this.state, source);
    if (!pile || pile.at(-1) !== selection.cardId) {
      return this.rejection('Only an exposed top card can move directly to a foundation.');
    }
    return this.accept(autoMoveToFoundation(this.state, source), 'Card sent to its foundation.');
  }

  undo(): ActionResult {
    const result = engineUndo(this.state);
    if (!result.ok) return this.rejection(result.error.message);
    this.replace(result.state);
    return { accepted: true, message: 'Previous action restored.' };
  }

  hint(): HintResult {
    const hints = getHints(this.state);
    if (hints.length === 0) {
      return { source: null, target: null, stockAction: false, message: 'No moves found — try undo, restart, or a new deal.' };
    }
    const hint = hints[this.hintIndex % hints.length];
    this.hintIndex = (this.hintIndex + 1) % hints.length;
    return this.presentHint(hint);
  }

  autoComplete(): AutoCompleteResult {
    if (!this.autoCompleteAvailable || !this.cachedPlan) {
      return { accepted: false, message: 'No automatic completion is available yet.', frames: [] };
    }
    const plan = this.cachedPlan;
    const frames: BoardView[] = [];
    let working = cloneGameState(this.state);
    for (const action of plan.actions) {
      let result: EngineResult;
      if (action.kind === 'draw-stock') result = drawStock(working);
      else if (action.kind === 'recycle-stock') result = recycleStock(working);
      else result = autoMoveToFoundation(working, action.source);
      if (!result.ok) return { accepted: false, message: result.error.message, frames: [] };
      working = { ...result.state, history: [] };
      frames.push(toBoardView(working));
    }
    const result = applyAutoComplete(this.state, plan);
    if (!result.ok) return { accepted: false, message: result.error.message, frames: [] };
    this.replace(result.state);
    return { accepted: true, message: 'Deal completed.', frames };
  }

  victoryCards(): Array<{ suit: string; rank: number }> {
    return SUITS.flatMap((suit: Suit) => this.state.foundations[suit].map((id) => ({
      suit: this.state.cards[id].suit,
      rank: this.state.cards[id].rank,
    })));
  }

  private accept(result: EngineResult, message: string): ActionResult {
    if (!result.ok) return this.rejection(result.error.message);
    this.replace(result.state);
    return { accepted: true, message };
  }

  private rejection(message: string): ActionResult {
    return { accepted: false, message };
  }

  private replace(state: GameState): void {
    this.state = state;
    this.invalidateDerived();
  }

  private invalidateDerived(): void {
    this.hintIndex = 0;
    this.cachedPlanState = null;
    this.cachedPlan = null;
  }

  private presentHint(hint: Hint): HintResult {
    if (hint.kind !== 'move') {
      return {
        source: null,
        target: { zone: 'stock', index: 0 },
        stockAction: true,
        message: hint.kind === 'draw-stock' ? 'Try drawing from the stock.' : 'Try recycling the waste into the stock.',
      };
    }
    const pile = getPileCards(this.state, hint.source);
    const index = hint.startIndex ?? ((pile?.length ?? 1) - 1);
    const cardId = pile?.[index] ?? null;
    if (!cardId) return { source: null, target: null, stockAction: false, message: 'Try another action.' };
    const card = this.state.cards[cardId];
    return {
      source: { source: fromRef(hint.source), cardId },
      target: fromRef(hint.destination),
      stockAction: false,
      message: `Try moving the ${this.rankName(card.rank)} of ${card.suit}.`,
    };
  }

  private rankName(rank: number): string {
    return rank === 1 ? 'Ace' : rank === 11 ? 'Jack' : rank === 12 ? 'Queen' : rank === 13 ? 'King' : String(rank);
  }
}
