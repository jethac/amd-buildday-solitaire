export const SAVE_VERSION = 1;
export const SAVE_KEY = 'green-felt-solitaire.save.v1';

export interface UserPreferences {
  drawMode: 1 | 3;
  scored: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  drawMode: 1,
  scored: false,
  reduceMotion: false,
  highContrast: false,
};

export interface SaveEnvelope {
  saveVersion: number;
  savedAt: number;
  preferences: UserPreferences;
  /** Stays true after undoing the first move so active play time never pauses. */
  timerStarted?: boolean;
  game: unknown;
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; save: SaveEnvelope }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unavailable'; reason: string };

function isPreferences(value: unknown): value is UserPreferences {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<UserPreferences>;
  return (candidate.drawMode === 1 || candidate.drawMode === 3)
    && typeof candidate.scored === 'boolean'
    && typeof candidate.reduceMotion === 'boolean'
    && typeof candidate.highContrast === 'boolean';
}

export function loadGame(): LoadResult {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { kind: 'empty' };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return { kind: 'invalid', reason: 'The save is not an object.' };
    const candidate = value as Partial<SaveEnvelope>;
    if (candidate.saveVersion !== SAVE_VERSION || !isPreferences(candidate.preferences) || !candidate.game) {
      return { kind: 'invalid', reason: 'The save version or contents are not supported.' };
    }
    return { kind: 'loaded', save: candidate as SaveEnvelope };
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: 'invalid', reason: error.message };
    return { kind: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}

export function saveGame(game: unknown, preferences: UserPreferences, timerStarted: boolean): boolean {
  const envelope: SaveEnvelope = {
    saveVersion: SAVE_VERSION,
    savedAt: Date.now(),
    preferences,
    timerStarted,
    game,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function discardGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be unavailable in private browsing; in-memory play still works.
  }
}
