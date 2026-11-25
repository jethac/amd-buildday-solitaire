import './styles.css';
import type { ActionResult, AppDriver } from './app-driver';
import { EngineDriver } from './engine-driver';
import { ActiveClock, formatTime } from './services/clock';
import { copyText, createGameNumber, normalizeGameNumber } from './services/seed';
import { DEFAULT_PREFERENCES, discardGame, loadGame, saveGame, type UserPreferences } from './services/storage';
import { Notifications } from './services/toast';
import { BoardRenderer, type MoveRequest, type Selection } from './ui/board';
import { GameDialogs } from './ui/dialogs';
import { VictoryCelebration } from './ui/victory';

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

const notifications = new Notifications();
const driver: AppDriver = new EngineDriver();
const clock = new ActiveClock();
const dialogs = new GameDialogs(() => reconcileClock());
const celebration = new VictoryCelebration();
const systemReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let preferences: UserPreferences = { ...DEFAULT_PREFERENCES };
let selection: Selection | null = null;
let storageWarningShown = false;
let timerStarted = false;
let autoCompleting = false;
let skipAutoComplete = false;
let victoryActive = false;
let gameRevision = 0;
let wonHandled = false;

const board = new BoardRenderer({
  onDraw: () => attempt(() => driver.draw()),
  onMove: (request: MoveRequest) => attempt(() => driver.move(request)),
  onAutoFoundation: (requested: Selection) => attempt(() => driver.autoFoundation(requested)),
  canMove: (request) => !interactionLocked() && driver.canMove(request),
  onInvalid: (message) => notifications.show(message),
  onSelect: (current) => { selection = current; },
});

function interactionLocked(): boolean {
  return autoCompleting || victoryActive;
}

/** Lazy evaluation is intentional: locked input must never mutate the engine. */
function attempt(action: () => ActionResult): boolean {
  if (interactionLocked()) return false;
  return perform(action());
}

function effectiveReducedMotion(): boolean {
  return preferences.reduceMotion || systemReducedMotion.matches;
}

function applyPreferences(): void {
  document.body.classList.toggle('reduce-motion', effectiveReducedMotion());
  document.body.classList.toggle('high-contrast', preferences.highContrast);
  board.setReducedMotion(effectiveReducedMotion());
  required<HTMLInputElement>('scoring-toggle').checked = preferences.scored;
  required<HTMLInputElement>('motion-toggle').checked = preferences.reduceMotion;
  required<HTMLInputElement>('contrast-toggle').checked = preferences.highContrast;
  required('score-stat').hidden = !preferences.scored;
  required('draw-mode-label').textContent = `Draw ${driver.drawMode}`;
  required('new-draw-1').classList.toggle('selected', driver.drawMode === 1);
  required('new-draw-3').classList.toggle('selected', driver.drawMode === 3);
}

function reconcileClock(): void {
  const shouldRun = timerStarted && !driver.won && !interactionLocked() && !dialogs.anyOpen && !document.hidden;
  if (shouldRun) clock.start();
  else clock.pause();
}

function persist(): void {
  driver.setElapsedMs(clock.elapsedMs);
  if (!saveGame(driver.serialize(), preferences, timerStarted) && !storageWarningShown) {
    storageWarningShown = true;
    notifications.show('Browser storage is unavailable. This session will keep playing in memory.', 4500);
  }
}

function refresh(animate = true): void {
  board.render(driver.view, animate);
  required('moves-value').textContent = String(driver.moves);
  required('score-value').textContent = String(driver.score);
  required('time-value').textContent = formatTime(clock.elapsedMs);
  required<HTMLButtonElement>('undo-button').disabled = !driver.canUndo || interactionLocked();
  required<HTMLButtonElement>('hint-button').disabled = interactionLocked() || driver.won;
  required<HTMLButtonElement>('restart-button').disabled = interactionLocked();
  required<HTMLButtonElement>('new-game-button').disabled = interactionLocked();
  required<HTMLButtonElement>('menu-button').disabled = interactionLocked();
  const autoButton = required<HTMLButtonElement>('autocomplete-button');
  const available = driver.autoCompleteAvailable;
  autoButton.disabled = victoryActive || (!autoCompleting && !available);
  autoButton.hidden = victoryActive || driver.won || (!autoCompleting && !available);
  autoButton.innerHTML = autoCompleting
    ? '<span aria-hidden="true">■</span><span>Skip</span>'
    : '<span aria-hidden="true">»</span><span>Auto-complete</span>';
  autoButton.setAttribute('aria-label', autoCompleting ? 'Skip automatic completion' : 'Auto-complete the deal');
  required('game-number-value').textContent = driver.seed;
  applyPreferences();
  selection = null;
  board.setInputLocked(interactionLocked());
  reconcileClock();
  driver.setElapsedMs(clock.elapsedMs);
}

function perform(result: ActionResult): boolean {
  if (interactionLocked()) return false;
  if (!result.accepted) {
    notifications.show(result.message);
    return false;
  }
  timerStarted = true;
  board.clearSelection();
  wonHandled = false;
  refresh();
  if (result.message) notifications.announce(result.message);
  persist();
  if (driver.won) void handleVictory();
  return true;
}

function newDeal(seed: string, drawMode: 1 | 3): void {
  gameRevision += 1;
  celebration.stop();
  required('app').inert = false;
  autoCompleting = false;
  skipAutoComplete = false;
  victoryActive = false;
  wonHandled = false;
  timerStarted = false;
  board.setInputLocked(false);
  clock.pause();
  clock.reset();
  dialogs.closeAll();
  driver.newGame(seed, drawMode);
  preferences.drawMode = drawMode;
  board.clearSelection();
  refresh(false);
  persist();
  notifications.show(`New Draw ${drawMode} game · ${seed}`);
}

async function requestNewDeal(seed: string, drawMode: 1 | 3, skipConfirmation = false): Promise<void> {
  if (interactionLocked()) return;
  const hasProgress = timerStarted && !driver.won;
  dialogs.menu.close();
  dialogs.results.close();
  if (!skipConfirmation && hasProgress) {
    const accepted = await dialogs.confirm('Leave this deal?', 'Your progress on this deal will be replaced with a new game.', 'Start new game');
    if (!accepted) return;
  }
  newDeal(seed, drawMode);
}

async function requestRestart(skipConfirmation = false): Promise<void> {
  if (interactionLocked()) return;
  if (timerStarted && !driver.won && !skipConfirmation) {
    const accepted = await dialogs.confirm('Restart this deal?', 'Return every card to its original position? Your current moves and time will be cleared.', 'Restart deal');
    if (!accepted) return;
  }
  gameRevision += 1;
  celebration.stop();
  required('app').inert = false;
  autoCompleting = false;
  skipAutoComplete = false;
  victoryActive = false;
  timerStarted = false;
  board.setInputLocked(false);
  clock.pause();
  clock.reset();
  dialogs.closeAll();
  driver.restart();
  wonHandled = false;
  board.clearSelection();
  refresh();
  persist();
  notifications.show(`Deal ${driver.seed} restarted.`);
}

async function handleVictory(): Promise<void> {
  if (wonHandled) return;
  wonHandled = true;
  const revision = gameRevision;
  clock.pause();
  driver.setElapsedMs(clock.elapsedMs);
  victoryActive = true;
  refresh();
  required('app').inert = true;
  persist();
  await new Promise<void>((resolve) => celebration.start(driver.victoryCards(), effectiveReducedMotion(), resolve));
  if (gameRevision !== revision) return;
  victoryActive = false;
  required('app').inert = false;
  board.setInputLocked(autoCompleting);
  refresh(false);
  if (driver.won) dialogs.showResults(clock.elapsedMs, driver.moves, driver.score, preferences.scored);
}

async function runAutoComplete(): Promise<void> {
  if (interactionLocked() || !driver.autoCompleteAvailable) return;
  autoCompleting = true;
  skipAutoComplete = false;
  const revision = gameRevision;
  clock.pause();
  board.clearSelection();
  refresh();
  const result = driver.autoComplete();
  if (!result.accepted) {
    autoCompleting = false;
    notifications.show(result.message);
    refresh();
    return;
  }
  timerStarted = true;
  notifications.show('Completing the deal · press Skip to finish now.', Math.max(1100, result.frames.length * 85 + 300));
  for (const frame of result.frames) {
    if (gameRevision !== revision) return;
    if (skipAutoComplete || effectiveReducedMotion()) break;
    board.render(frame, false);
    await new Promise<void>((resolve) => setTimeout(resolve, 85));
  }
  if (gameRevision !== revision) return;
  autoCompleting = false;
  refresh();
  persist();
  if (driver.won) void handleVictory();
}

function showHint(): void {
  if (driver.won || interactionLocked()) return;
  const hint = driver.hint();
  board.showHint(hint.source, hint.target, hint.stockAction);
  notifications.show(hint.message);
}

required('new-game-button').addEventListener('click', () => void requestNewDeal(createGameNumber(), preferences.drawMode));
required('menu-button').addEventListener('click', () => {
  if (interactionLocked()) return;
  applyPreferences();
  dialogs.showMenu();
});
required('restart-button').addEventListener('click', () => void requestRestart());
required('undo-button').addEventListener('click', () => {
  if (attempt(() => driver.undo())) notifications.show('Move undone.');
});
required('hint-button').addEventListener('click', showHint);
required('autocomplete-button').addEventListener('click', () => {
  if (autoCompleting) skipAutoComplete = true;
  else void runAutoComplete();
});
required('new-draw-1').addEventListener('click', () => void requestNewDeal(createGameNumber(), 1));
required('new-draw-3').addEventListener('click', () => void requestNewDeal(createGameNumber(), 3));
required('replay-button').addEventListener('click', () => void requestRestart(true));
required('win-new-button').addEventListener('click', () => void requestNewDeal(createGameNumber(), preferences.drawMode, true));

async function copyCurrentGameNumber(): Promise<void> {
  const seed = driver.seed;
  const copied = await copyText(seed);
  if (copied) {
    notifications.show(`Game number ${seed} copied.`);
    required('menu-copy-status').textContent = `Game number ${seed} copied.`;
    return;
  }
  if (!dialogs.menu.open) dialogs.showMenu();
  const input = required<HTMLInputElement>('seed-input');
  input.value = seed;
  input.focus();
  input.select();
  required('menu-copy-status').textContent = `Automatic copy was unavailable. Game number ${seed} is selected for you to copy.`;
}
required('game-number-button').addEventListener('click', () => void copyCurrentGameNumber());
required('copy-number-button').addEventListener('click', () => void copyCurrentGameNumber());

required<HTMLInputElement>('scoring-toggle').addEventListener('change', (event) => {
  preferences.scored = (event.currentTarget as HTMLInputElement).checked;
  applyPreferences();
  persist();
});
required<HTMLInputElement>('motion-toggle').addEventListener('change', (event) => {
  preferences.reduceMotion = (event.currentTarget as HTMLInputElement).checked;
  applyPreferences();
  persist();
});
required<HTMLInputElement>('contrast-toggle').addEventListener('change', (event) => {
  preferences.highContrast = (event.currentTarget as HTMLInputElement).checked;
  applyPreferences();
  persist();
});
systemReducedMotion.addEventListener('change', applyPreferences);

required('seed-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = required<HTMLInputElement>('seed-input');
  const seed = normalizeGameNumber(input.value);
  if (!seed) {
    input.setCustomValidity('Enter a game number containing digits only.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  void requestNewDeal(seed, preferences.drawMode);
});
required<HTMLInputElement>('seed-input').addEventListener('input', (event) => {
  (event.currentTarget as HTMLInputElement).setCustomValidity('');
});

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || dialogs.anyOpen || interactionLocked()) return;
  const target = event.target as HTMLElement;
  if (target.matches('input, textarea, select, [contenteditable="true"]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (driver.canUndo) attempt(() => driver.undo());
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === 'u') {
    event.preventDefault();
    if (driver.canUndo) attempt(() => driver.undo());
  } else if (event.key.toLowerCase() === 'h') {
    event.preventDefault();
    showHint();
  } else if (event.key.toLowerCase() === 'f' && selection) {
    event.preventDefault();
    const selected = selection;
    attempt(() => driver.autoFoundation(selected));
  } else if (event.key === 'Escape') {
    board.clearSelection();
  }
});

document.addEventListener('visibilitychange', () => {
  reconcileClock();
  if (document.hidden) persist();
  else refresh(false);
});
window.addEventListener('beforeunload', persist);
setInterval(() => {
  reconcileClock();
  required('time-value').textContent = formatTime(clock.elapsedMs);
}, 250);

function initialize(): void {
  const result = loadGame();
  let restored = false;
  let message = '';
  if (result.kind === 'loaded') {
    preferences = { ...result.save.preferences };
    restored = driver.restore(result.save.game);
    if (!restored) message = 'Your previous game could not be restored, so a fresh deal was started.';
  } else if (result.kind === 'invalid') {
    message = 'Your previous game could not be restored, so a fresh deal was started.';
  } else if (result.kind === 'unavailable') {
    storageWarningShown = true;
    message = 'Browser storage is unavailable. Your game will remain in memory for this session.';
  }
  if (!restored) {
    if (result.kind === 'invalid') discardGame();
    driver.newGame(createGameNumber(), preferences.drawMode);
  }
  timerStarted = result.kind === 'loaded'
    ? result.save.timerStarted ?? (driver.moves > 0 || driver.elapsedMs > 0)
    : false;
  clock.reset(driver.elapsedMs);
  wonHandled = driver.won;
  applyPreferences();
  refresh(false);
  persist();
  if (message) notifications.show(message, 4500);
  if (driver.won) dialogs.showResults(clock.elapsedMs, driver.moves, driver.score, preferences.scored);
}

initialize();
