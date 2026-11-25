export class ActiveClock {
  private elapsed: number;
  private runningSince: number | null = null;

  constructor(elapsedMs = 0, private readonly now: () => number = () => performance.now()) {
    this.elapsed = Math.max(0, elapsedMs);
  }

  get elapsedMs(): number {
    return Math.round(this.elapsed + (this.runningSince === null ? 0 : this.now() - this.runningSince));
  }

  get isRunning(): boolean {
    return this.runningSince !== null;
  }

  start(): void {
    if (this.runningSince === null) this.runningSince = this.now();
  }

  pause(): number {
    this.elapsed = this.elapsedMs;
    this.runningSince = null;
    return Math.round(this.elapsed);
  }

  reset(elapsedMs = 0): void {
    this.elapsed = Math.max(0, elapsedMs);
    this.runningSince = null;
  }
}

export function formatTime(elapsedMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
