interface VictoryCard {
  suit: string;
  rank: number;
}

interface Particle {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
}

const SUITS: Record<string, string> = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦', S: '♠', H: '♥', C: '♣', D: '♦' };
const RANKS: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function createSprite(card: VictoryCard, width: number, height: number): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = Math.max(1, Math.round(width));
  sprite.height = Math.max(1, Math.round(height));
  const context = sprite.getContext('2d');
  if (!context) return sprite;
  const symbol = SUITS[card.suit] ?? card.suit;
  const rank = RANKS[card.rank] ?? String(card.rank);
  const red = card.suit === 'hearts' || card.suit === 'diamonds' || card.suit === 'H' || card.suit === 'D';
  context.fillStyle = '#fffdf4';
  roundedRect(context, 0, 0, width, height, Math.max(3, width * .065));
  context.fill();
  context.strokeStyle = '#263a31';
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = red ? '#bf3041' : '#172a25';
  context.font = `bold ${Math.max(12, width * .22)}px Georgia`;
  context.textAlign = 'center';
  context.fillText(rank, width * .15, height * .15);
  context.fillText(symbol, width * .15, height * .29);
  context.font = `${Math.max(20, width * .45)}px Georgia`;
  context.fillText(symbol, width * .53, height * .66);
  return sprite;
}

export class VictoryCelebration {
  private frame = 0;
  private launchTimer = 0;
  private finishTimer = 0;
  private active = false;

  start(cards: VictoryCard[], reducedMotion: boolean, onFinished: () => void): void {
    this.stop();
    if (reducedMotion || cards.length === 0) {
      onFinished();
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'skip-victory';
    skip.textContent = 'Skip celebration';
    skip.setAttribute('aria-label', 'Skip victory celebration');
    // Keep the actual button outside the accessibility-hidden canvas layer.
    overlay.setAttribute('aria-hidden', 'false');
    overlay.append(canvas, skip);
    document.body.append(overlay);
    skip.focus({ preventScroll: true });
    const context = canvas.getContext('2d');
    if (!context) {
      overlay.remove();
      onFinished();
      return;
    }
    const pixelRatio = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * pixelRatio);
    canvas.height = Math.round(innerHeight * pixelRatio);
    context.scale(pixelRatio, pixelRatio);
    this.active = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.stop();
      overlay.remove();
      onFinished();
    };
    skip.addEventListener('click', finish);
    const ordered = [...cards].reverse();
    const particles: Particle[] = [];
    let next = 0;
    const width = Math.max(42, Math.min(105, innerWidth / 9));
    const height = width * 1.4;
    const launch = () => {
      if (!this.active || next >= ordered.length) return;
      const card = ordered[next];
      particles.push({
        sprite: createSprite(card, width, height),
        x: Math.max(5, innerWidth - width - 25 - (next % 4) * width * .08),
        y: Math.max(18, innerHeight * .18),
        vx: -(3.2 + (next % 7) * .7),
        vy: -(4 + (next % 5) * 1.25),
        active: true,
      });
      next += 1;
      this.launchTimer = window.setTimeout(launch, 75);
    };
    launch();
    const tick = () => {
      if (!this.active) return;
      // Do not clear: earlier frames form the familiar trailing card images.
      let visible = 0;
      for (const particle of particles) {
        if (!particle.active) continue;
        particle.vy += .19;
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.y + height > innerHeight) {
          particle.y = innerHeight - height;
          particle.vy = -Math.abs(particle.vy) * .82;
        }
        if (particle.x < -width || particle.x > innerWidth + width || particle.y > innerHeight + height) {
          particle.active = false;
          continue;
        }
        context.drawImage(particle.sprite, particle.x, particle.y);
        visible += 1;
      }
      if (next >= ordered.length && visible === 0 && particles.length > 0) {
        finish();
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    this.finishTimer = window.setTimeout(finish, 15_000);
  }

  stop(): void {
    this.active = false;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.launchTimer);
    clearTimeout(this.finishTimer);
    document.querySelectorAll('.victory-overlay').forEach((overlay) => overlay.remove());
  }
}
