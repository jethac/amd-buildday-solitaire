import type { BoardView, MoveRequest, Selection } from './ui/board';

export interface ActionResult {
  accepted: boolean;
  message: string;
}

export interface HintResult {
  source: Selection | null;
  target: import('./ui/board').Location | null;
  stockAction: boolean;
  message: string;
}

export interface AutoCompleteResult extends ActionResult {
  frames: BoardView[];
}

/** Thin application-facing contract implemented by the pure engine adapter. */
export interface AppDriver {
  readonly view: BoardView;
  readonly seed: string;
  readonly drawMode: 1 | 3;
  readonly moves: number;
  readonly score: number;
  readonly canUndo: boolean;
  readonly won: boolean;
  readonly elapsedMs: number;
  newGame(seed: string, drawMode: 1 | 3): void;
  restore(serialized: unknown): boolean;
  serialize(): unknown;
  setElapsedMs(elapsedMs: number): void;
  restart(): void;
  draw(): ActionResult;
  move(request: MoveRequest): ActionResult;
  canMove(request: MoveRequest): boolean;
  autoFoundation(selection: Selection): ActionResult;
  undo(): ActionResult;
  hint(): HintResult;
  autoComplete(): AutoCompleteResult;
  readonly autoCompleteAvailable: boolean;
  victoryCards(): Array<{ suit: string; rank: number }>;
}
