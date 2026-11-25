export class Notifications {
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly element = this.required<HTMLDivElement>('toast');
  private readonly announcer = this.required<HTMLDivElement>('announcer');

  show(message: string, duration = 2800): void {
    if (this.hideTimer !== undefined) clearTimeout(this.hideTimer);
    this.element.textContent = message;
    this.element.hidden = false;
    this.announcer.textContent = message;
    this.hideTimer = setTimeout(() => {
      this.element.hidden = true;
    }, duration);
  }

  announce(message: string): void {
    this.announcer.textContent = '';
    requestAnimationFrame(() => {
      this.announcer.textContent = message;
    });
  }

  private required<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element #${id}`);
    return element as T;
  }
}
