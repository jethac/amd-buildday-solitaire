import type { PileRef } from './types';

export const SCORE_VALUES = {
  wasteToTableau: 5,
  toFoundation: 10,
  revealTableauCard: 5,
  foundationToTableau: -15,
  tableauToTableau: 0,
  stockAction: 0,
} as const;

export function calculateMoveScore(
  source: PileRef,
  destination: PileRef,
  revealedCard: boolean,
): number {
  let delta = 0;

  if (source.type === 'foundation' && destination.type === 'tableau') {
    delta += SCORE_VALUES.foundationToTableau;
  } else if (
    (source.type === 'waste' || source.type === 'tableau') &&
    destination.type === 'foundation'
  ) {
    delta += SCORE_VALUES.toFoundation;
  } else if (source.type === 'waste' && destination.type === 'tableau') {
    delta += SCORE_VALUES.wasteToTableau;
  }

  if (revealedCard) {
    delta += SCORE_VALUES.revealTableauCard;
  }
  return delta;
}

/** Applies the per-transaction score floor and returns the actual delta. */
export function applyScoreFloor(
  currentScore: number,
  requestedDelta: number,
): { score: number; scoreDelta: number } {
  const score = Math.max(0, currentScore + requestedDelta);
  return { score, scoreDelta: score - currentScore };
}
