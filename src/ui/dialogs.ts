import { formatTime } from '../services/clock';

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

export class GameDialogs {
  readonly menu = required<HTMLDialogElement>('menu-dialog');
  readonly help = required<HTMLDialogElement>('help-dialog');
  readonly confirmDialog = required<HTMLDialogElement>('confirm-dialog');
  readonly results = required<HTMLDialogElement>('results-dialog');
  private confirmResolve: ((accepted: boolean) => void) | undefined;

  constructor(private readonly onModalChange: () => void = () => undefined) {
    document.querySelectorAll<HTMLButtonElement>('.dialog-close').forEach((button) => {
      button.addEventListener('click', () => button.closest<HTMLDialogElement>('dialog')?.close());
    });
    required<HTMLButtonElement>('help-button').addEventListener('click', () => this.showHelp());
    required<HTMLButtonElement>('menu-help-button').addEventListener('click', () => {
      this.menu.close();
      this.showHelp();
    });
    document.querySelector('#help-dialog .dialog-done')?.addEventListener('click', () => this.help.close());
    required<HTMLButtonElement>('confirm-cancel').addEventListener('click', () => this.resolveConfirm(false));
    required<HTMLButtonElement>('confirm-accept').addEventListener('click', () => this.resolveConfirm(true));
    this.confirmDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.resolveConfirm(false);
    });
    document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
      dialog.addEventListener('close', this.onModalChange);
      dialog.addEventListener('cancel', () => setTimeout(this.onModalChange, 0));
    });
  }

  showMenu(): void {
    if (!this.menu.open) this.menu.showModal();
    this.onModalChange();
  }

  showHelp(): void {
    if (!this.help.open) this.help.showModal();
    this.onModalChange();
  }

  confirm(title: string, message: string, acceptLabel: string): Promise<boolean> {
    if (this.confirmResolve) this.confirmResolve(false);
    required('confirm-title').textContent = title;
    required('confirm-message').textContent = message;
    required('confirm-accept').textContent = acceptLabel;
    this.confirmDialog.showModal();
    this.onModalChange();
    return new Promise((resolve) => {
      this.confirmResolve = resolve;
    });
  }

  showResults(elapsedMs: number, moves: number, score: number, scored: boolean): void {
    required('result-time').textContent = formatTime(elapsedMs);
    required('result-moves').textContent = String(moves);
    required('result-score').textContent = String(score);
    required('result-score-box').hidden = !scored;
    if (!this.results.open) this.results.showModal();
    this.onModalChange();
  }

  closeAll(): void {
    document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((dialog) => dialog.close());
    this.onModalChange();
  }

  get anyOpen(): boolean {
    return Boolean(document.querySelector('dialog[open]'));
  }

  private resolveConfirm(accepted: boolean): void {
    const resolve = this.confirmResolve;
    this.confirmResolve = undefined;
    this.confirmDialog.close();
    resolve?.(accepted);
  }
}
