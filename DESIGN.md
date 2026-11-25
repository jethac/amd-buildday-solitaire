# Solitaire — HTML5 Game Design

**Status:** Implemented and verified  
**Game:** Klondike Solitaire, inspired by the classic Windows game  
**Platform:** Desktop and mobile web  
**Deployment:** Static site; no backend required

## 1. Vision

Build a polished, browser-native recreation of the familiar Windows Solitaire experience. It should be immediately understandable to anyone who has played Klondike: deal, drag cards, reveal hidden cards, and move every suit to its foundation. The green table, crisp cards, restrained controls, and bouncing-card victory sequence should evoke the original without copying proprietary Microsoft artwork or assets.

The implementation should feel fast and dependable rather than overproduced. Rules must be authoritative, moves must be reversible, and the game must work equally well with a mouse, touchscreen, or keyboard.

## 2. Design Pillars

1. **Familiar:** Use standard Klondike rules and instantly recognizable card-table composition.
2. **Effortless:** Make legal actions obvious, use forgiving drop targets, and keep common controls close at hand.
3. **Nostalgic, not dated:** Preserve the green felt and celebratory card cascade while providing responsive layout, scalable graphics, and accessible controls.
4. **Deterministic:** A seed always reproduces the same deal, and undo restores the exact prior state.
5. **Local and private:** No account, analytics, advertising, networking, or server-side game state.

## 3. Scope

### 3.1 Initial release

- Klondike with **Draw 1** and **Draw 3** modes.
- Random, reproducible 52-card deals; deals are not guaranteed to be solvable.
- Full legal-move validation and automatic tableau-card revealing.
- Mouse, touch, click-to-move, double-click, and keyboard play.
- Unlimited undo for the current deal, restart of the same deal, and new deals.
- Contextual hints and safe automatic completion when available.
- Move counter, elapsed time, optional classic-style scoring, and game-number display.
- Automatic local saving of the active game and preferences.
- Responsive layout, reduced-motion support, and screen-reader announcements.
- Original card-rendered graphics with an AI&-branded card back and a bouncing-card victory celebration.
- Unit tests for the rules engine and browser tests for core interactions.

### 3.2 Intentional exclusions

The following are not part of the initial release:

- Spider, FreeCell, Pyramid, or other Solitaire variants.
- Vegas scoring, daily challenges, guaranteed-winnable deals, or leaderboards.
- Redo, multiplayer, accounts, cloud synchronization, or social features.
- Installable PWA support or offline caching after the page has been closed.
- Exact legacy Windows menus, artwork, fonts, or sound assets.
- Themes, card-back unlocks, and other progression systems.

## 4. Rules and Gameplay

### 4.1 Setup

Use one standard 52-card deck with no jokers.

- Deal seven tableau columns from left to right. Columns 1 through 7 contain 1 through 7 cards respectively.
- In each column, only the top card begins face-up; all cards beneath it are face-down.
- Place the remaining 24 cards face-down in the stock.
- Begin with an empty waste and four empty foundations, one for each suit.
- Cards within a pile are ordered from bottom to top; only exposed cards may normally be manipulated.

The initial deal is generated with a seeded Fisher–Yates shuffle. The resulting cards are dealt in fixed order, so saving the seed and deal version is enough to reproduce the initial position.

### 4.2 Tableau rules

- Build downward by rank in alternating colors: for example, a black 8 may be placed on a red 9.
- Any face-up card may be dragged together with the correctly ordered sequence below it.
- Only a King, or a valid descending sequence headed by a King, may move into an empty column.
- When a move exposes a face-down tableau card, turn that card face-up automatically as part of the same action.
- Moving a stack between columns is legal even when it does not reveal a card, although hints should avoid recommending pointless moves.

### 4.3 Foundations

- Build each foundation upward by suit from Ace through King.
- Only one exposed card may move to a foundation at a time.
- The top foundation card may move back to a legal tableau position. It cannot move directly to the stock or waste.
- Double-clicking or double-tapping an eligible exposed card sends it to its suit foundation.
- Auto-completion, when available, also uses only legal single-card foundation moves.

### 4.4 Stock and waste

- Activating the stock moves one card in Draw 1 or up to three cards in Draw 3 to the waste, face-up.
- A short final draw is legal when fewer cards remain than the draw count.
- Only the top waste card is playable.
- When the stock is empty, activating its space recycles the entire waste into the stock without shuffling.
- Recycling reverses the waste back into the stock so the original stock draw order is preserved.
- Both modes allow unlimited passes through the stock.

### 4.5 Winning and stalled positions

The game is won exactly when all four foundations contain 13 cards, for a total of 52 cards. Stop the timer at that moment and start the victory sequence.

A deal can become unwinnable or appear stalled. The game must not declare a loss merely because its hint search finds no useful action. If no action is found, show **“No moves found — try undo, restart, or a new deal.”**

### 4.6 Draw mode changing

Draw 1 is the default. Draw 3 can be selected when starting a new game. Changing draw mode during an active deal requires confirmation and starts a fresh deal; it must not mutate the rules of the current game.

## 5. Core Actions, Undo, and Hints

Every player action is processed as an atomic transaction:

1. Validate the requested action against the current state.
2. Apply the move or stock action.
3. Automatically reveal a newly exposed tableau card when required.
4. Update move count and score.
5. Record enough information to reverse the entire transaction.
6. Check for victory and persist the new state.

Dragging a stack counts as one move regardless of its size. An automatic reveal and a stock recycle are included in their associated undo transactions. Invalid drops do not change state, score, history, or the move counter.

Undo restores cards, face-up states, pile order, score, move count, and stock/waste order. It does not turn back the elapsed timer. Restart confirms if progress exists, restores the original deal, clears history, and resets time, moves, and score.

Hints enumerate legal actions and prioritize them in this order:

1. A tableau move that reveals a hidden card.
2. A legal move to a foundation.
3. Playing the top waste card.
4. A productive tableau rearrangement or King move into an empty column.
5. Drawing or recycling the stock.

A hint highlights the source and destination without performing the move. Repeated hint requests may cycle through alternatives. Purely circular moves, such as moving a King from one empty-based column to another without revealing anything, are omitted.

## 6. Scoring, Time, and Completion

### 6.1 Scoring

Offer **Scored** and **Relaxed** preferences. Relaxed mode hides the score and is the default for a calm first-run experience. The engine still tracks score, so switching this preference only changes visibility. Scored mode displays this transparent, classic-inspired table:

| Action | Points |
| --- | ---: |
| Waste to tableau | +5 |
| Waste or tableau to foundation | +10 |
| Reveal a face-down tableau card | +5 |
| Foundation to tableau | −15 |
| Tableau to tableau | 0 |
| Draw or recycle stock | 0 |

The score never falls below zero. Undo exactly reverses the transaction's score change. The timer is informational: there is no time penalty or speed bonus in the initial release.

### 6.2 Timer and counters

- The timer starts on the first committed gameplay action, not while the player reads the initial board.
- Count active play time; pause while the page is hidden, a blocking dialog is open, or the game is won.
- Display elapsed time and committed moves in the toolbar or status area.
- Save accumulated elapsed time rather than relying on a continuously running browser timestamp.

### 6.3 Automatic completion

Offer **Auto-complete** once no tableau card remains face-down. Before showing it, run a lightweight simulation using legal foundation moves and stock draws to ensure a completing sequence exists.

When activated:

- Lock ordinary input.
- Move cards to foundations one at a time with a short animation.
- Allow the sequence to be skipped immediately via reduced-motion preferences or a Skip button.
- Treat the whole auto-complete sequence as one undoable user action.
- Detect victory through the same rule used for normal play.

## 7. User Interface

### 7.1 Board layout

The board always reads in the conventional arrangement:

```text
[New] [Restart] [Undo] [Hint]       [Moves] [Time] [Score] [Menu]

[Stock] [Waste]        [♠ Foundation] [♥ Foundation] [♣ Foundation] [♦ Foundation]

[Tableau 1] [Tableau 2] [Tableau 3] [Tableau 4] [Tableau 5] [Tableau 6] [Tableau 7]
```

- **Stock:** A card back when cards remain; a circular-arrow outline when recycling is available; an empty outline otherwise.
- **Waste:** Show the top card. In Draw 3, a small horizontal fan may expose the previous two cards, but only the top card is interactive.
- **Foundations:** Empty positions display large, low-contrast suit markers.
- **Tableau:** Face-down cards use tight vertical spacing; face-up cards use larger spacing so every selectable starting card exposes its rank and suit.
- **Status:** Show a short message for invalid actions, hints, saved-game recovery, and victory. Avoid alert popups during ordinary play.

### 7.2 Menus and dialogs

The main toolbar contains New, Restart, Undo, Hint, and Menu. The menu opens a compact dialog containing:

- New Draw 1 game.
- New Draw 3 game.
- Copy game number.
- Scored or Relaxed mode.
- Sound preference, if sound is added after the core release.
- Rules and controls.
- Reduced-motion and high-contrast overrides.

New game and restart require confirmation only when the current deal has progress and is not already won. Dialogs trap focus, close with Escape where safe, and restore focus to the invoking control.

### 7.3 Victory

On victory, show a canvas overlay above the table. Cards launch from the foundations, bounce off the bottom of the viewport, and leave the familiar trailing-image effect. This is an original implementation of the celebratory concept, not an extracted asset.

Also provide an immediately available **Skip celebration** control. After the animation or on skip, show a small results dialog with time, moves, score, **New game**, and **Replay this deal**. Reduced-motion mode replaces the cascade with a brief static success treatment.

## 8. Interaction Model

### 8.1 Pointer input

Use Pointer Events rather than native HTML drag-and-drop so mouse, pen, and touch share one implementation.

- On pointer down, identify the exposed card and the exact movable stack.
- Start dragging only after a small movement threshold, allowing ordinary clicks to remain clicks.
- Capture the pointer and render the dragged stack in a raised overlay using transforms.
- Expand legal drop targets modestly so precision is unnecessary, while keeping the visual cards unchanged.
- On a valid drop, animate into place and commit one transaction.
- On an invalid drop, pointer cancellation, or lost capture, return the stack without changing state.
- Use `touch-action: none` only on interactive board elements; keep normal page behavior elsewhere.

### 8.2 Click and tap

- Click an exposed movable card or stack to select it, then click a legal destination.
- Click the selection again or press Escape to cancel.
- Click a stock card to draw or its empty outline to recycle.
- Double-click or double-tap a playable top card to send it to its foundation.
- A single click never unexpectedly moves a tableau card to another tableau column.

### 8.3 Keyboard

- **Tab / Shift+Tab:** Move among toolbar controls and board regions.
- **Arrow keys:** Move between piles; Up/Down within a tableau selects a different legal face-up starting card.
- **Enter / Space:** Select, drop, or activate the focused stock/pile.
- **F:** Move the selected card to its foundation when legal.
- **H:** Request a hint.
- **Ctrl/Cmd+Z** or **U:** Undo.
- **Escape:** Cancel selection or close the current dismissible dialog.

All keyboard operations pass through the same command and validation layer as pointer input.

## 9. Visual and Audio Direction

### 9.1 Visual style

- A saturated green felt table with a subtle CSS-only texture.
- Off-white cards with thin borders, a visible paper edge, subtle face lighting, and a classic 5:7 width-to-height ratio.
- Black spades/clubs and red hearts/diamonds, with distinct suit shapes so color is never the only identifier.
- Large corner ranks and suit marks, simple centered court-card illustrations made from original CSS/inline SVG artwork, and a consistent geometric card back featuring the AI& logo obtained from aiand.com. The logo is bundled locally and used unmodified; the surrounding card pattern is original.
- Tahoma-like system typography for controls where available, with system fallbacks; no downloaded font dependency.
- Soft hover, selection, legal-target, and keyboard-focus treatments that remain distinguishable from one another.

### 9.2 Motion

- Deal new cards in a short stagger, with an option to skip immediately.
- Animate committed moves and auto-flips in roughly 120–180 ms.
- Give cards tactile CSS 3D depth: a modest perspective lift on hover, a slightly raised drag stack, and a quick physical turn whenever a card changes face. Motion must never obscure the rank or make targets move under an active drag.
- Use `transform`, `rotate`, and `opacity` for animation; avoid per-frame layout changes.
- Input remains locked only for the specific moving elements, not for long cosmetic sequences.
- With `prefers-reduced-motion: reduce`, use immediate placement, no 3D lift/turn or dealing stagger, no bouncing victory cards, and no parallax or unnecessary transitions.

### 9.3 Audio

Sound is optional polish, not required for core completion. If implemented, generate or bundle tiny original sounds for card placement, flipping, invalid drops, and victory. Default to muted until the player opts in, and never let audio block gameplay.

## 10. Responsive and Accessible Behavior

### 10.1 Responsive board

- Size cards from available width so all seven columns fit on desktop and portrait phones.
- Preserve card aspect ratio and prioritize exposed rank/suit corners over decorative center art on small screens.
- Reduce gaps and tableau fan spacing at narrow widths; allow vertical page scrolling rather than shrinking cards indefinitely.
- On larger screens, cap card dimensions and center the board to avoid excessive pointer travel.
- Recalculate layout on resize or orientation change without resetting selections, history, or game state.
- Keep controls and drop targets at least 44×44 CSS pixels where practical, and never below WCAG target-size requirements.

### 10.2 Accessibility

- Use real buttons for toolbar actions and semantic, focusable board elements for cards and piles.
- Give every face-up card an accessible name such as “Red 7 of hearts, tableau column 3, movable stack of 2.”
- Never expose the identity of a face-down card to assistive technology.
- Announce selection, legal moves, rejected moves, stock actions, undo, and victory through a polite live region.
- Provide clear visible focus, sufficient text/card contrast, and a high-contrast option.
- Do not rely on color alone for suit, selection, validity, or status.
- Respect reduced motion and browser zoom up to 200% without losing game controls or card information.

## 11. Technical Design

### 11.1 Stack and rendering choice

Use **TypeScript, semantic HTML, CSS, and Vite**, with no runtime UI framework.

- The cards and piles are DOM elements. This simplifies responsive layout, keyboard focus, accessible names, and crisp scalable text.
- A lightweight **Canvas 2D overlay** is used only for the high-object-count victory cascade.
- CSS and bundled SVG provide all visual assets, keeping the package self-contained and sharp at every resolution. Logo provenance is recorded in `src/assets/ATTRIBUTION.md`.
- Vitest covers the pure game engine; Playwright covers important browser and touch flows.

The game logic must not import or depend on DOM APIs. The DOM renders state and dispatches intentions; it never decides whether a move is legal.

### 11.2 Proposed module boundaries

```text
index.html
src/
  main.ts                 Application startup and dependency wiring
  styles.css              Board, cards, controls, and responsive themes
  game/
    types.ts              Cards, piles, modes, actions, and state types
    deck.ts               Seeded shuffle and initial deal
    rules.ts              Move validation and legal-action enumeration
    engine.ts             Atomic actions, automatic flips, and victory
    history.ts            Undo and restart
    scoring.ts            Score deltas and move/time metadata
    autocomplete.ts       Completion search and action plan
  ui/
    board.ts              DOM rendering and FLIP move animations
    input.ts              Pointer, click, and keyboard command handling
    hints.ts              Hint presentation
    dialogs.ts            Menu, confirmations, rules, and results
    victory.ts            Canvas celebration
  services/
    storage.ts            Versioned save validation and persistence
    seed.ts               Seed parsing, display, and generation
tests/
  unit/                   Rules, engine, history, shuffle, and scoring
  browser/                Input, persistence, accessibility, and win flows
```

Module names are organizational guidance, not a requirement to create abstractions before they are needed.

### 11.3 State model

A serializable game state contains:

- A schema version and rules/deal version.
- The deal seed, draw mode, and scoring preference.
- Each card's stable ID, suit, rank, color, and face-up state.
- Stock, waste, four foundations, and seven tableau columns as ordered card-ID lists.
- Move count, score, accumulated active elapsed time, and timer-start metadata.
- Status: dealing, playing, auto-completing, or won.

Maintain these invariants after every committed action:

1. Each of the 52 card IDs occurs in exactly one pile.
2. Stock cards are face-down; waste and foundation cards are face-up.
3. Within each tableau, all face-down cards form the bottom segment and all face-up cards form the top segment.
4. A face-up tableau run is descending and alternating in color.
5. Each foundation contains one suit in uninterrupted Ace-to-current-rank order.
6. Only the top stock/waste/foundation cards and valid face-up tableau suffixes can be moved.
7. A won state has exactly 13 cards in every foundation.

Actions are expressed as intentions such as `DRAW_STOCK`, `RECYCLE_WASTE`, `MOVE_CARDS`, `MOVE_TO_FOUNDATION`, and `UNDO`. The engine returns either a new state plus transaction or a structured rejection reason. UI animation begins only after acceptance, except that a dragged preview may follow the pointer before validation.

### 11.4 Rendering and animation

Use a render scheduler rather than rebuilding the DOM for every pointer movement. Persistent card elements are keyed by card ID; updates change pile membership, face, z-order, and transforms as needed.

For committed card moves, use a simple FLIP sequence: measure before and after positions, then animate the inverse transform to zero. During dragging, only the drag overlay is updated inside `requestAnimationFrame`. Model state is committed once, not continuously during the animation.

Card graphics are cached as DOM/SVG structures. Victory-canvas sprites may be pre-rendered once per card size and reused to avoid generating images during the celebration.

### 11.5 Randomness and game numbers

- Represent a deal with a human-readable seed/game number.
- Hash that seed into a documented 32-bit PRNG and use Fisher–Yates with no `Math.random()` calls in deal generation.
- Include the algorithm version in saved games so future shuffle changes do not silently alter old deals.
- “Copy game number” writes the seed to the clipboard when permitted and provides selectable text as a fallback.
- Random deals are not advertised as solvable; testing solvability is outside the initial scope.

## 12. Persistence and Recovery

Use `localStorage` for preferences and the active game. Save after every committed transaction, on undo, when the page becomes hidden, and when settings change.

The saved payload includes:

- Save schema version.
- Initial seed and rules version.
- Full current game state.
- Compact undo transactions.
- Original-deal restart information or enough data to reconstruct it.
- Draw/scoring, motion, contrast, and audio preferences.

Loading must validate the entire payload before use, including card uniqueness and pile invariants. If parsing or validation fails, preserve no broken half-state: start a fresh deal and show a non-blocking message that the previous game could not be restored.

Reloading a won game shows the completed board and results without automatically replaying the celebration. Reloading an in-progress game resumes it with the timer paused until the next active-play interval.

## 13. Error Handling and Edge Cases

- **Rapid input:** Ignore commands that would conflict with an in-flight committed animation; never clone or lose cards.
- **Resize during drag:** Cancel the preview safely and retain the pre-drag state.
- **Pointer cancellation:** Return dragged cards and clear temporary styling.
- **Empty stock:** Recycling is available only when the stock is empty and waste is non-empty.
- **Short Draw 3:** Move all remaining cards when one or two remain.
- **Foundation reversal:** Allow it only to a legal tableau destination and apply the score rule once.
- **Automatic reveal:** Flip only a newly exposed top tableau card that was face-down before the action.
- **Invalid action:** Give a brief visual/status explanation, but do not modify game history.
- **Background tab:** Suspend active-time accumulation and nonessential animation.
- **Storage unavailable or full:** Continue in memory and display one non-blocking warning.
- **Corrupt/old save:** Use schema validation and, when explicitly supported, a migration; otherwise fall back safely.
- **No useful hint:** Offer stock, undo, restart, or new deal without claiming the deal is impossible.
- **Repeated victory checks:** Make victory entry idempotent so score, saved state, and celebration cannot trigger twice.

## 14. Performance and Browser Targets

- Target current stable Chrome, Edge, Firefox, and Safari, plus current mobile Chrome and Safari.
- Aim for smooth 60 fps dragging and card motion on a typical mid-range phone.
- Keep the initial release dependency-free at runtime and avoid large image/audio downloads.
- Perform no network requests during play.
- Keep layout reads out of pointer-move loops and use transforms for moving cards.
- Stop `requestAnimationFrame` loops when no animation is active.

## 15. Testing Strategy

### 15.1 Unit tests

Test at minimum:

- Initial deal counts, card uniqueness, and face-up/face-down placement.
- Same seed and version produce the identical initial state.
- Tableau rank/color validation and King-only empty-column behavior.
- Legal multi-card stack movement and rejection of broken or face-down stacks.
- Foundation suit/rank progression and legal moves back to tableau.
- Draw 1, Draw 3, short final draws, waste-top restrictions, and exact recycle ordering.
- Automatic reveal and its inclusion in the same undo transaction.
- Score deltas, zero floor, move counting, and undo reversal.
- Auto-completion planning and ordinary victory detection.
- Serialization round trips and rejection of malformed saves.
- Invariant checks after long sequences of generated legal and illegal actions.

### 15.2 Browser tests

Cover:

- A complete game flow using a controlled test state or fixture.
- Drag/drop, click-to-move, double-click foundation movement, and cancellation.
- Touch-sized input behavior and resize/orientation changes.
- Keyboard-only play, visible focus, dialogs, and live-region messages.
- Undo, restart with the same seed, and new-game confirmation.
- Reload/resume, timer pause on visibility changes, and corrupt-save recovery.
- Reduced-motion and high-contrast rendering.
- Victory idempotency, Skip, replay, and starting another deal.

Visual checks should cover a narrow phone, a typical laptop, and a large desktop at both 100% and 200% zoom.

## 16. Delivery Milestones

### Milestone 1 — Rules foundation

Implement the state types, seeded deal, legal moves, stock/waste behavior, scoring, undo, and victory detection. Unit tests must pass before visual work depends on the engine.

### Milestone 2 — Playable board

Build the responsive DOM board and all primary pointer/click interactions. A player must be able to start, play, undo, restart, and win without keyboard traps or invalid states.

### Milestone 3 — Complete experience

Add keyboard support, hints, auto-completion, local persistence, preferences, help, responsive refinements, and accessible announcements.

### Milestone 4 — Polish and verification

Add deal/move animation, original court-card polish, the canvas victory sequence, cross-browser tests, performance checks, and final edge-case fixes.

## 17. Definition of Done

The initial release is complete when:

- A new player can understand and complete a Draw 1 or Draw 3 game using only the in-game presentation.
- Every move follows the rules above, and each of the 52 cards remains accounted for after arbitrary moves and undo operations.
- Mouse, touch, click-to-move, and keyboard paths can perform all essential gameplay actions.
- Refreshing safely resumes the current game; restarting reproduces the same deal.
- The board remains usable on phone and desktop layouts and at 200% browser zoom.
- Reduced-motion users receive no mandatory card cascade or extended movement.
- The victory sequence plays once, can be skipped, and does not block starting another game.
- The production build is a static, self-contained site with no backend or third-party runtime service.
- Unit and browser tests covering the behaviors in this document pass in the production configuration.
