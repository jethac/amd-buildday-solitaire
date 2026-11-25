import {
  autoMoveToFoundation,
  drawStock,
  isWon,
  recycleStock,
} from './engine';
import {
  cloneBoardForAction,
  cloneTransaction,
  commitTransaction,
} from './history';
import { getPileCards } from './rules';
import type {
  ActionRejection,
  ActionResult,
  AutoCompleteAction,
  AutoCompletePlan,
  AutoCompletePlanResult,
  AutoCompleteTransaction,
  GameState,
  PileRef,
  RejectionCode,
} from './types';

const MAX_SEARCH_STATES = 20_000;

function rejection(
  code: RejectionCode,
  message: string,
  details: ActionRejection['details'] = {},
): ActionRejection {
  return { code, message, details };
}

function planFailure(state: GameState, error: ActionRejection): AutoCompletePlanResult {
  return { ok: false, state, error };
}

function hiddenPrecondition(state: GameState): ActionRejection | null {
  if (state.status === 'won') {
    return rejection('ALREADY_WON', 'This deal is already complete.');
  }
  if (state.status !== 'playing') {
    return rejection('GAME_NOT_PLAYING', 'Auto-complete is not available in the current status.');
  }
  for (const column of state.tableau) {
    for (const id of column) {
      if (!state.cards[id]?.faceUp) {
        return rejection(
          'AUTO_COMPLETE_HIDDEN_CARDS',
          'Auto-complete is offered only after every tableau card is face-up.',
        );
      }
    }
  }
  return null;
}

/** Omits scoring/history, preserving only data relevant to completion search. */
function completionKey(state: GameState): string {
  return JSON.stringify([
    state.stock,
    state.waste,
    state.tableau,
    state.foundations.spades,
    state.foundations.hearts,
    state.foundations.clubs,
    state.foundations.diamonds,
  ]);
}

function withoutHistory(state: GameState): GameState {
  return { ...state, history: [] };
}

/** Depth-first exhaustive search over monotonic foundation progress and stock actions. */
function searchCompletion(initial: GameState): AutoCompleteAction[] | null {
  const visited = new Set<string>();
  let searched = 0;
  let truncated = false;

  const visit = (state: GameState): AutoCompleteAction[] | null => {
    if (isWon(state)) return [];
    if (truncated) return null;
    const key = completionKey(state);
    if (visited.has(key)) return null;
    visited.add(key);
    searched += 1;
    if (searched > MAX_SEARCH_STATES) {
      truncated = true;
      return null;
    }

    const sources: PileRef[] = [];
    for (let index = 0; index < 7; index += 1) {
      if (state.tableau[index].length > 0) {
        sources.push({ type: 'tableau', index });
      }
    }
    if (state.waste.length > 0) sources.push({ type: 'waste' });

    // Foundation progress is monotonic; try every legal exposed card before stock actions.
    for (const source of sources) {
      const pile = getPileCards(state, source);
      const cardId = pile?.[pile.length - 1];
      if (!cardId) continue;
      const result = autoMoveToFoundation(state, source);
      if (!result.ok) continue;
      const action: AutoCompleteAction = {
        kind: 'move-to-foundation',
        source,
        cardId,
      };
      const remainder = visit(withoutHistory(result.state));
      if (remainder) return [action, ...remainder];
    }

    if (state.stock.length > 0) {
      const result = drawStock(state);
      if (result.ok) {
        const remainder = visit(withoutHistory(result.state));
        if (remainder) return [{ kind: 'draw-stock' }, ...remainder];
      }
    } else if (state.waste.length > 0) {
      const result = recycleStock(state);
      if (result.ok) {
        const remainder = visit(withoutHistory(result.state));
        if (remainder) return [{ kind: 'recycle-stock' }, ...remainder];
      }
    }
    return null;
  };

  return visit(initial);
}

/** Returns a validated executable plan only if legal moves can actually reach victory. */
export function planAutoComplete(state: GameState): AutoCompletePlanResult {
  const precondition = hiddenPrecondition(state);
  if (precondition) return planFailure(state, precondition);

  const initial = withoutHistory(cloneBoardForAction(state));
  const actions = searchCompletion(initial);
  if (!actions) {
    return planFailure(
      state,
      rejection(
        'NO_AUTO_COMPLETE',
        'No completing sequence of legal foundation and stock actions was found.',
      ),
    );
  }

  return {
    ok: true,
    plan: {
      dealVersion: state.dealVersion,
      seed: state.seed,
      drawMode: state.drawMode,
      actions,
    },
  };
}

function invalidPlan(
  state: GameState,
  index: number,
  cause: ActionRejection,
): ActionResult {
  return {
    ok: false,
    state,
    error: rejection(
      'INVALID_AUTO_COMPLETE_PLAN',
      `Auto-complete plan action ${index + 1} is no longer legal: ${cause.message}`,
      { index, cause: cause.code },
    ),
  };
}

/** Applies the entire plan or none of it, and records exactly one undo transaction. */
export function applyAutoComplete(state: GameState, plan: AutoCompletePlan): ActionResult {
  const precondition = hiddenPrecondition(state);
  if (precondition) {
    return { ok: false, state, error: precondition };
  }
  if (
    plan.dealVersion !== state.dealVersion ||
    plan.seed !== state.seed ||
    plan.drawMode !== state.drawMode ||
    !Array.isArray(plan.actions)
  ) {
    return {
      ok: false,
      state,
      error: rejection(
        'INVALID_AUTO_COMPLETE_PLAN',
        'The plan belongs to a different deal or is malformed.',
      ),
    };
  }

  let working = withoutHistory(cloneBoardForAction(state));
  const steps: AutoCompleteTransaction['steps'] = [];

  for (let index = 0; index < plan.actions.length; index += 1) {
    const action = plan.actions[index] as AutoCompleteAction;
    let result: ActionResult;

    if (action.kind === 'move-to-foundation') {
      const pile = getPileCards(working, action.source);
      if (!pile || pile[pile.length - 1] !== action.cardId) {
        return invalidPlan(
          state,
          index,
          rejection('CARD_NOT_TOP', 'The planned card is no longer exposed at its source.'),
        );
      }
      result = autoMoveToFoundation(working, action.source);
    } else if (action.kind === 'draw-stock') {
      result = drawStock(working);
    } else if (action.kind === 'recycle-stock') {
      result = recycleStock(working);
    } else {
      return invalidPlan(
        state,
        index,
        rejection('INVALID_AUTO_COMPLETE_PLAN', 'Unknown plan action.'),
      );
    }

    if (!result.ok) return invalidPlan(state, index, result.error);
    if (result.transaction.kind === 'auto-complete') {
      return invalidPlan(
        state,
        index,
        rejection('INVALID_AUTO_COMPLETE_PLAN', 'Nested auto-complete steps are not allowed.'),
      );
    }
    steps.push(cloneTransaction(result.transaction) as AutoCompleteTransaction['steps'][number]);
    working = withoutHistory(result.state);
  }

  if (!isWon(working)) {
    return {
      ok: false,
      state,
      error: rejection(
        'INCOMPLETE_AUTO_COMPLETE',
        'The supplied plan did not move every card to a foundation.',
      ),
    };
  }

  const transaction: AutoCompleteTransaction = {
    kind: 'auto-complete',
    steps,
    scoreDelta: working.score - state.score,
    moveCountDelta: working.moves - state.moves,
  };
  return {
    ok: true,
    state: commitTransaction(state, working, transaction),
    transaction,
  };
}
