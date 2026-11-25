export type PileZone = 'stock' | 'waste' | 'foundation' | 'tableau';

export interface Location {
  zone: PileZone;
  index: number;
}

export interface BoardCard {
  id: string;
  suit: 'spades' | 'hearts' | 'clubs' | 'diamonds';
  rank: number;
  faceUp: boolean;
}

export interface BoardView {
  stock: BoardCard[];
  waste: BoardCard[];
  foundations: BoardCard[][];
  tableau: BoardCard[][];
}

export interface Selection {
  source: Location;
  cardId: string;
}

export interface MoveRequest extends Selection {
  target: Location;
}

interface BoardCallbacks {
  onDraw: () => boolean;
  onMove: (request: MoveRequest) => boolean;
  onAutoFoundation: (selection: Selection) => boolean;
  canMove: (request: MoveRequest) => boolean;
  onInvalid: (message: string) => void;
  onSelect: (selection: Selection | null) => void;
}

interface PointerStart extends Selection {
  pointerId: number;
  x: number;
  y: number;
  element: HTMLElement;
}

const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'] as const;
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' } as const;
const SUIT_NAMES = { spades: 'Spades', hearts: 'Hearts', clubs: 'Clubs', diamonds: 'Diamonds' } as const;
const RANK_NAMES: Record<number, string> = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' };
const PIP_LAYOUTS: Record<number, number> = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10 };

function sameLocation(a: Location, b: Location): boolean {
  return a.zone === b.zone && a.index === b.index;
}

function rankLabel(rank: number): string {
  return RANK_NAMES[rank] ?? String(rank);
}

function shortRank(rank: number): string {
  return rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
}

function cardName(card: BoardCard): string {
  const color = card.suit === 'hearts' || card.suit === 'diamonds' ? 'Red' : 'Black';
  return `${color} ${rankLabel(card.rank)} of ${card.suit}`;
}

function pileName(location: Location): string {
  if (location.zone === 'stock') return 'Stock';
  if (location.zone === 'waste') return 'Waste';
  if (location.zone === 'foundation') return `${SUIT_NAMES[SUITS[location.index]]} foundation`;
  return `Tableau column ${location.index + 1}`;
}

export class BoardRenderer {
  private readonly board = this.required('game-board');
  private readonly topRow = this.required('top-row');
  private readonly tableauRow = this.required('tableau-row');
  private readonly dragLayer = this.required('drag-layer');
  private readonly stockPile: HTMLElement;
  private readonly foundations: HTMLElement[] = [];
  private readonly tableau: HTMLElement[] = [];
  private wastePile: HTMLElement;
  private readonly piles = new Map<string, HTMLElement>();
  private readonly cardElements = new Map<string, HTMLButtonElement>();
  private readonly resizeObserver: ResizeObserver;
  private observedWidth = 0;
  private view: BoardView = { stock: [], waste: [], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []] };
  private selection: Selection | null = null;
  private pointerStart: PointerStart | null = null;
  private dragging: PointerStart | null = null;
  private dragStack: HTMLElement | null = null;
  private suppressClick = false;
  private lastClick: { cardId: string; time: number } | null = null;
  private keyboardIndexes = new Array<number>(7).fill(-1);
  private reducedMotion = false;
  private inputLocked = false;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly callbacks: BoardCallbacks) {
    this.stockPile = this.createPile({ zone: 'stock', index: 0 }, this.topRow);
    this.wastePile = this.createPile({ zone: 'waste', index: 0 }, this.topRow);
    const spacer = document.createElement('div');
    spacer.className = 'top-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    this.topRow.append(spacer);
    for (let index = 0; index < 4; index += 1) {
      this.foundations.push(this.createPile({ zone: 'foundation', index }, this.topRow, true));
    }
    for (let index = 0; index < 7; index += 1) {
      this.tableau.push(this.createPile({ zone: 'tableau', index }, this.tableauRow, true));
    }
    this.resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (Math.abs(width - this.observedWidth) < .5) return;
      this.observedWidth = width;
      this.layout();
    });
    this.resizeObserver.observe(this.board);
    document.addEventListener('pointermove', this.onPointerMove, { passive: false });
    document.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('pointercancel', this.cancelDrag);
    window.addEventListener('resize', this.cancelDrag);
    window.addEventListener('blur', this.cancelDrag);
    this.layout();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  setInputLocked(locked: boolean): void {
    this.inputLocked = locked;
    this.board.classList.toggle('input-locked', locked);
    this.board.setAttribute('aria-busy', String(locked));
    if (locked) {
      this.clearSelection();
      this.cancelDrag();
    }
  }

  render(view: BoardView, animate = true): void {
    const oldRects = new Map<string, DOMRect>();
    if (animate && !this.reducedMotion) {
      for (const [id, element] of this.cardElements) oldRects.set(id, element.getBoundingClientRect());
    }
    this.view = view;
    this.clearHints();
    const visibleIds = new Set<string>();
    this.renderSimplePile(this.stockPile, view.stock.slice(-1), { zone: 'stock', index: 0 }, visibleIds);
    this.renderSimplePile(this.wastePile, view.waste.slice(-1), { zone: 'waste', index: 0 }, visibleIds);
    view.foundations.forEach((cards, index) => {
      this.renderSimplePile(this.foundations[index], cards.slice(-1), { zone: 'foundation', index }, visibleIds);
    });
    view.tableau.forEach((cards, index) => {
      const pile = this.tableau[index];
      cards.forEach((card, cardIndex) => {
        const element = this.upsertCard(card, { zone: 'tableau', index }, visibleIds);
        element.style.zIndex = String(cardIndex + 1);
        pile.append(element);
      });
      this.updateTableauHeight(index);
      if (this.keyboardIndexes[index] >= cards.length || this.keyboardIndexes[index] < 0) {
        this.keyboardIndexes[index] = Math.max(0, cards.findIndex((card) => card.faceUp));
      }
      this.updateKeyboardCard(index);
    });
    for (const [id, element] of this.cardElements) {
      if (!visibleIds.has(id)) {
        element.remove();
        this.cardElements.delete(id);
      }
    }
    this.layout(false);
    if (animate && !this.reducedMotion) {
      for (const [id, element] of this.cardElements) {
        const old = oldRects.get(id);
        if (!old || !element.isConnected) continue;
        const current = element.getBoundingClientRect();
        const dx = old.left - current.left;
        const dy = old.top - current.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        element.animate([
          { translate: `${dx}px ${dy}px` },
          { translate: '0px 0px' },
        ], { duration: 155, easing: 'ease-out' });
      }
    }
    this.refreshHighlights();
  }

  clearSelection(): void {
    this.selection = null;
    this.board.querySelectorAll('.selected').forEach((element) => element.classList.remove('selected'));
    this.board.querySelectorAll('.has-selection').forEach((element) => element.classList.remove('has-selection'));
    this.refreshHighlights();
    this.callbacks.onSelect(null);
  }

  showHint(source: Selection | null, target: Location | null, stockAction = false): void {
    this.clearHints();
    if (stockAction) {
      this.stockPile.classList.add('hint-target');
    } else if (source && target) {
      this.cardElements.get(source.cardId)?.classList.add('hint-card');
      this.getPile(target)?.classList.add('hint-target');
    }
    this.hintTimer = setTimeout(() => this.clearHints(), 2100);
  }

  focusPile(location: Location): void {
    this.getPile(location)?.focus();
  }

  layout(updateHeights = true): void {
    const cardWidth = this.stockPile.getBoundingClientRect().width;
    if (cardWidth <= 0) return;
    this.board.style.setProperty('--card-width', `${cardWidth}px`);
    if (updateHeights) {
      for (let index = 0; index < 7; index += 1) this.updateTableauHeight(index);
    }
  }

  private createPile(location: Location, parent: HTMLElement, empty = false): HTMLElement {
    const pile = document.createElement('div');
    pile.className = `pile ${location.zone}${location.zone === 'tableau' ? ' tableau-pile' : ''}`;
    pile.dataset.zone = location.zone;
    pile.dataset.index = String(location.index);
    pile.tabIndex = 0;
    pile.setAttribute('role', 'group');
    pile.setAttribute('aria-label', pileName(location));
    pile.addEventListener('click', this.onPileClick);
    pile.addEventListener('pointerdown', this.onPointerDown);
    pile.addEventListener('lostpointercapture', this.onLostPointerCapture);
    pile.addEventListener('keydown', this.onKeyDown);
    if (empty || location.zone === 'stock' || location.zone === 'waste') {
      const placeholder = document.createElement('div');
      placeholder.className = 'empty-pile';
      if (location.zone === 'foundation') placeholder.innerHTML = `<span class="empty-suit" aria-hidden="true">${SUIT_SYMBOLS[SUITS[location.index]]}</span>`;
      if (location.zone === 'stock') placeholder.innerHTML = '<span class="stock-empty"><span class="recycle-icon" aria-hidden="true">↻</span></span>';
      pile.append(placeholder);
    }
    this.piles.set(this.locationKey(location), pile);
    parent.append(pile);
    return pile;
  }

  private renderSimplePile(pile: HTMLElement, cards: BoardCard[], location: Location, visibleIds: Set<string>): void {
    cards.forEach((card) => {
      const element = this.upsertCard(card, location, visibleIds);
      element.style.setProperty('--card-y', '0px');
      element.style.zIndex = '2';
      pile.append(element);
    });
    pile.classList.toggle('is-empty', cards.length === 0);
    const count = location.zone === 'stock' ? this.view.stock.length : location.zone === 'waste' ? this.view.waste.length : this.view.foundations[location.index].length;
    if (location.zone === 'stock') {
      const canRecycle = this.view.stock.length === 0 && this.view.waste.length > 0;
      const placeholder = pile.querySelector<HTMLElement>('.empty-pile');
      if (placeholder) {
        placeholder.innerHTML = canRecycle
          ? '<span class="stock-empty"><span class="recycle-icon" aria-hidden="true">↻</span></span>'
          : '';
        placeholder.setAttribute('aria-hidden', 'true');
      }
      const instruction = this.view.stock.length > 0
        ? ' Press Enter to draw.'
        : canRecycle
          ? ' Stock and waste can be recycled. Press Enter to recycle.'
          : ' Stock and waste are empty.';
      pile.setAttribute('aria-label', `${pileName(location)}, ${count} card${count === 1 ? '' : 's'}.${instruction}`);
    } else {
      pile.setAttribute('aria-label', `${pileName(location)}, ${count} card${count === 1 ? '' : 's'}`);
    }
  }

  private upsertCard(card: BoardCard, location: Location, visibleIds: Set<string>): HTMLButtonElement {
    visibleIds.add(card.id);
    let element = this.cardElements.get(card.id);
    if (!element) {
      element = document.createElement('button');
      element.type = 'button';
      element.tabIndex = -1;
      element.draggable = false;
      element.className = 'card';
      element.dataset.cardId = card.id;
      element.id = `card-${card.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      element.addEventListener('click', this.onCardClick);
      this.cardElements.set(card.id, element);
    }
    element.dataset.zone = location.zone;
    element.dataset.index = String(location.index);
    const faceKey = card.faceUp ? `${card.suit}-${card.rank}-up` : 'down';
    const previousFace = element.dataset.face;
    if (element.dataset.face !== faceKey) {
      element.dataset.face = faceKey;
      element.classList.toggle('face-down', !card.faceUp);
      element.classList.toggle('red', card.faceUp && (card.suit === 'hearts' || card.suit === 'diamonds'));
      element.classList.toggle('black', card.faceUp && (card.suit === 'spades' || card.suit === 'clubs'));
      element.innerHTML = card.faceUp ? this.faceMarkup(card) : '<span class="card-back" aria-hidden="true"></span>';
    }
    if (previousFace && previousFace !== faceKey && !this.reducedMotion) {
      element.animate([
        { rotate: 'y -88deg' },
        { rotate: 'y 0deg' },
      ], { duration: 185, easing: 'cubic-bezier(.2,.75,.3,1)' });
    }
    if (card.faceUp) {
      const movable = location.zone !== 'stock' && (location.zone === 'tableau' || this.isTopCard(card.id, location));
      const stackSize = movable && location.zone === 'tableau'
        ? this.view.tableau[location.index].length - this.view.tableau[location.index].findIndex((candidate) => candidate.id === card.id)
        : 1;
      const movementDetail = movable
        ? location.zone === 'tableau'
          ? `, movable stack of ${stackSize} card${stackSize === 1 ? '' : 's'}`
          : ', movable'
        : '';
      element.removeAttribute('aria-hidden');
      element.setAttribute('aria-label', `${cardName(card)}, ${pileName(location)}${movementDetail}`);
    } else {
      element.setAttribute('aria-label', 'Face-down card');
      element.setAttribute('aria-hidden', 'true');
    }
    element.style.setProperty('--card-y', '0px');
    return element;
  }

  private faceMarkup(card: BoardCard): string {
    const rank = shortRank(card.rank);
    const suit = SUIT_SYMBOLS[card.suit];
    const corners = `<span class="card-corner"><span>${rank}</span><span class="corner-suit">${suit}</span></span><span class="card-corner bottom" aria-hidden="true"><span>${rank}</span><span class="corner-suit">${suit}</span></span>`;
    let center: string;
    if (card.rank === 1) {
      center = `<span class="ace-suit">${suit}</span>`;
    } else if (card.rank >= 11) {
      const crown = card.rank === 11 ? '♞' : '♛';
      center = `<span class="court-art"><span class="court-crown">${crown}</span><span class="court-letter">${rank}</span><span class="court-suit">${suit}</span></span>`;
    } else {
      const count = PIP_LAYOUTS[card.rank] ?? 1;
      const pips = Array.from({ length: count }, (_, index) => `<span class="pip${card.rank % 2 === 1 && index === count - 1 ? ' center-pip' : ''}">${suit}</span>`).join('');
      center = `<span class="pip-field">${pips}</span>`;
    }
    return `${corners}<span class="card-center">${center}</span>`;
  }

  private updateTableauHeight(index: number): void {
    const pile = this.tableau[index];
    const cards = this.view.tableau[index] ?? [];
    const cardWidth = this.stockPile.getBoundingClientRect().width;
    if (cardWidth <= 0) return;
    const cardHeight = cardWidth * 1.4;
    const downStep = Math.max(4, Math.min(11, cardWidth * .10));
    // Expose both lines of the rank/suit corner on every movable card.
    const upStep = Math.max(22, Math.min(50, cardWidth * .40));
    let y = 0;
    cards.forEach((card, cardIndex) => {
      const element = this.cardElements.get(card.id);
      element?.style.setProperty('--card-y', `${y}px`);
      if (cardIndex < cards.length - 1) y += card.faceUp ? upStep : downStep;
    });
    pile.style.height = `${cards.length ? y + cardHeight : cardHeight}px`;
  }

  private readonly onCardClick = (event: Event): void => {
    event.stopPropagation();
    if (this.inputLocked || this.suppressClick) return;
    const element = event.currentTarget as HTMLButtonElement;
    const cardId = element.dataset.cardId;
    if (!cardId) return;
    const source = this.locationFromElement(element);
    if (source.zone === 'stock') {
      this.clearSelection();
      this.callbacks.onDraw();
      return;
    }
    const card = this.findCard(cardId, source);
    if (!card?.faceUp || !this.canSelect({ source, cardId })) return;
    const now = performance.now();
    if (this.lastClick?.cardId === cardId && now - this.lastClick.time < 330) {
      this.lastClick = null;
      this.clearSelection();
      this.callbacks.onAutoFoundation({ source, cardId });
      return;
    }
    this.lastClick = { cardId, time: now };
    if (this.selection) {
      if (this.selection.cardId === cardId) {
        this.clearSelection();
        return;
      }
      const accepted = this.callbacks.onMove({ ...this.selection, target: source });
      if (accepted) this.clearSelection();
      return;
    }
    this.select({ source, cardId });
  };

  private readonly onPileClick = (event: Event): void => {
    if (this.inputLocked || this.suppressClick || (event.target as HTMLElement).closest('.card')) return;
    const pile = event.currentTarget as HTMLElement;
    const target = this.locationFromElement(pile);
    if (target.zone === 'stock') {
      this.clearSelection();
      this.callbacks.onDraw();
      return;
    }
    if (!this.selection) return;
    const accepted = this.callbacks.onMove({ ...this.selection, target });
    if (accepted) this.clearSelection();
  };

  private select(selection: Selection): void {
    if (!this.canSelect(selection)) return;
    this.clearSelection();
    this.selection = selection;
    this.cardElements.get(selection.cardId)?.classList.add('selected');
    this.getPile(selection.source)?.classList.add('has-selection');
    const card = this.findCard(selection.cardId, selection.source);
    this.callbacks.onSelect(selection);
    this.refreshHighlights();
    if (card) this.callbacks.onInvalid(`${cardName(card)} selected. Choose a destination.`);
  }

  private refreshHighlights(): void {
    this.board.querySelectorAll('.drop-legal').forEach((element) => element.classList.remove('drop-legal'));
    const selection = this.dragging ?? this.selection;
    if (!selection) return;
    for (const [key, element] of this.piles) {
      const target = this.locationFromKey(key);
      if (sameLocation(target, selection.source)) continue;
      if (this.callbacks.canMove({ ...selection, target })) element.classList.add('drop-legal');
    }
  }

  private canSelect(selection: Selection): boolean {
    if (selection.source.zone === 'stock') return false;
    return this.isTopCard(selection.cardId, selection.source) || selection.source.zone === 'tableau';
  }

  private isTopCard(cardId: string, location: Location): boolean {
    const cards = this.cardsAt(location);
    return cards.at(-1)?.id === cardId;
  }

  private cardsAt(location: Location): BoardCard[] {
    if (location.zone === 'stock') return this.view.stock;
    if (location.zone === 'waste') return this.view.waste;
    if (location.zone === 'foundation') return this.view.foundations[location.index] ?? [];
    return this.view.tableau[location.index] ?? [];
  }

  private findCard(cardId: string, location: Location): BoardCard | undefined {
    return this.cardsAt(location).find((card) => card.id === cardId);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.inputLocked || !event.isPrimary || this.pointerStart || event.button !== 0 || this.anyDialogOpen()) return;
    const element = (event.target as HTMLElement).closest<HTMLButtonElement>('.card');
    const pile = event.currentTarget as HTMLElement;
    const source = this.locationFromElement(pile);
    const cardId = element?.dataset.cardId;
    if (!element || !cardId || source.zone === 'stock') return;
    const card = this.findCard(cardId, source);
    if (!card?.faceUp || !this.canSelect({ source, cardId })) return;
    this.pointerStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, source, cardId, element };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerStart || event.pointerId !== this.pointerStart.pointerId) return;
    if (!this.dragging) {
      if (Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) < 6) return;
      this.beginDrag(this.pointerStart, event);
    }
    if (!this.dragging || !this.dragStack) return;
    event.preventDefault();
    this.dragStack.style.left = `${event.clientX - (this.dragging.x - Number.parseFloat(this.dragStack.dataset.originLeft ?? '0'))}px`;
    this.dragStack.style.top = `${event.clientY - (this.dragging.y - Number.parseFloat(this.dragStack.dataset.originTop ?? '0'))}px`;
  };

  private beginDrag(start: PointerStart, event: PointerEvent): void {
    this.clearSelection();
    const firstRect = start.element.getBoundingClientRect();
    const cards = this.cardsAt(start.source);
    const cardIndex = cards.findIndex((card) => card.id === start.cardId);
    const dragCards = start.source.zone === 'tableau' ? cards.slice(cardIndex) : [cards[cardIndex]];
    const stack = document.createElement('div');
    stack.className = 'drag-stack';
    stack.style.setProperty('--drag-width', `${firstRect.width}px`);
    stack.style.setProperty('--card-width', `${firstRect.width}px`);
    stack.style.height = `${Math.max(firstRect.height, (this.cardsAt(start.source).at(-1)?.id === dragCards.at(-1)?.id ? this.getPile(start.source)?.getBoundingClientRect().bottom ?? 0 : 0) - firstRect.top)}px`;
    stack.dataset.originLeft = String(firstRect.left);
    stack.dataset.originTop = String(firstRect.top);
    stack.style.left = `${firstRect.left}px`;
    stack.style.top = `${firstRect.top}px`;
    for (const card of dragCards) {
      const original = this.cardElements.get(card.id);
      if (!original) continue;
      const clone = original.cloneNode(true) as HTMLButtonElement;
      clone.id = '';
      clone.tabIndex = -1;
      clone.classList.remove('selected', 'drag-source', 'hint-card');
      clone.style.setProperty('--card-y', `${original.getBoundingClientRect().top - firstRect.top}px`);
      stack.append(clone);
      original.classList.add('drag-source');
    }
    this.dragLayer.append(stack);
    this.dragLayer.classList.add('active');
    this.dragStack = stack;
    this.dragging = start;
    start.element.setPointerCapture?.(event.pointerId);
    this.refreshHighlights();
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pointerStart || event.pointerId !== this.pointerStart.pointerId) return;
    if (this.dragging) {
      event.preventDefault();
      event.stopPropagation();
      const stack = this.dragStack;
      if (stack) stack.style.visibility = 'hidden';
      const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.pile');
      if (stack) stack.style.visibility = '';
      const target = targetElement ? this.locationFromElement(targetElement) : null;
      const drag = this.dragging;
      let accepted = false;
      if (target && !sameLocation(target, drag.source)) {
        accepted = this.callbacks.onMove({ source: drag.source, cardId: drag.cardId, target });
      }
      if (!accepted && (!target || !sameLocation(target, drag.source))) {
        this.callbacks.onInvalid(target ? 'That card cannot go there.' : 'Cards returned to their pile.');
      }
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 0);
      this.cancelDrag();
    }
    this.pointerStart = null;
  };

  private readonly onLostPointerCapture = (): void => {
    if (this.dragging || this.pointerStart) this.cancelDrag();
  };

  private readonly cancelDrag = (): void => {
    this.pointerStart = null;
    this.dragLayer.classList.remove('active');
    this.dragLayer.replaceChildren();
    this.board.querySelectorAll('.drag-source').forEach((element) => element.classList.remove('drag-source'));
    this.dragStack = null;
    this.dragging = null;
    this.refreshHighlights();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.inputLocked) return;
    const pile = event.currentTarget as HTMLElement;
    const location = this.locationFromElement(pile);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const all = [...this.piles.values()];
      const current = all.indexOf(pile);
      const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
      all[next].focus();
      return;
    }
    if (location.zone === 'tableau' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const cards = this.view.tableau[location.index];
      const firstFaceUp = cards.findIndex((card) => card.faceUp);
      if (firstFaceUp < 0) return;
      const current = this.keyboardIndexes[location.index];
      const next = Math.max(firstFaceUp, Math.min(cards.length - 1, current + (event.key === 'ArrowUp' ? -1 : 1)));
      this.keyboardIndexes[location.index] = next;
      this.updateKeyboardCard(location.index);
      return;
    }
    if (event.key === 'Escape') {
      this.clearSelection();
      return;
    }
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      const selection = this.selection ?? this.keyboardSelection(location);
      if (selection) this.callbacks.onAutoFoundation(selection);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (location.zone === 'stock') {
      this.clearSelection();
      this.callbacks.onDraw();
      return;
    }
    if (this.selection) {
      if (this.callbacks.onMove({ ...this.selection, target: location })) this.clearSelection();
      return;
    }
    const selection = this.keyboardSelection(location);
    if (selection) this.select(selection);
  };

  private keyboardSelection(location: Location): Selection | null {
    const cards = this.cardsAt(location);
    if (cards.length === 0 || location.zone === 'stock') return null;
    const card = location.zone === 'tableau' ? cards[this.keyboardIndexes[location.index]] : cards.at(-1);
    if (!card?.faceUp) return null;
    return { source: location, cardId: card.id };
  }

  private updateKeyboardCard(index: number): void {
    const pile = this.tableau[index];
    pile.querySelectorAll('.keyboard-selected').forEach((element) => element.classList.remove('keyboard-selected'));
    const card = this.view.tableau[index]?.[this.keyboardIndexes[index]];
    if (!card) {
      pile.removeAttribute('aria-activedescendant');
      return;
    }
    const element = this.cardElements.get(card.id);
    if (element) {
      element.classList.add('keyboard-selected');
      pile.setAttribute('aria-activedescendant', element.id);
    }
  }

  private clearHints(): void {
    if (this.hintTimer !== undefined) clearTimeout(this.hintTimer);
    this.hintTimer = undefined;
    this.board.querySelectorAll('.hint-card, .hint-source, .hint-target').forEach((element) => {
      element.classList.remove('hint-card', 'hint-source', 'hint-target');
    });
  }

  private getPile(location: Location): HTMLElement | undefined {
    return this.piles.get(this.locationKey(location));
  }

  private locationFromElement(element: HTMLElement): Location {
    return { zone: element.dataset.zone as PileZone, index: Number(element.dataset.index) };
  }

  private locationKey(location: Location): string {
    return `${location.zone}:${location.index}`;
  }

  private locationFromKey(key: string): Location {
    const [zone, index] = key.split(':');
    return { zone: zone as PileZone, index: Number(index) };
  }

  private anyDialogOpen(): boolean {
    return Boolean(document.querySelector('dialog[open]'));
  }

  private required(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element #${id}`);
    return element;
  }
}
