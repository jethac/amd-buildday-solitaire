# Goal: Complete HTML5 Solitaire

Implement the complete, production-ready Klondike Solitaire game specified in `DESIGN.md`. Deliver a finished game—not a prototype, scaffold, or partial vertical slice—that can be built and deployed as a static website and played from the initial deal through victory without backend services.

`DESIGN.md` is the source of truth for gameplay, presentation, architecture, accessibility, persistence, testing, and scope. Implement all features listed for the initial release while preserving the intentional exclusions. Keep the implementation as simple and maintainable as possible, and do not replace working functionality with placeholders or merely descriptive documentation.

## Required Outcome

The finished game must:

- Support complete Draw 1 and Draw 3 games with authoritative Klondike rules, reproducible seeded deals, valid stock/waste behavior, automatic tableau reveals, and correct victory detection.
- Provide every specified gameplay action through mouse and touch, with full click-to-move and keyboard alternatives.
- Include functional new-game, same-deal restart, unlimited undo, hint, auto-complete, game-number, timer, move-counter, and Scored/Relaxed features.
- Preserve the exact game across undo, restart, reload, stock recycling, automatic completion, and victory without losing or duplicating cards.
- Save and validate the active game and preferences locally, resume safely, and recover gracefully when storage is unavailable or invalid.
- Present a polished, original Windows-inspired visual experience on phones and desktops, including responsive cards, clear interaction feedback, move animations, and a skippable bouncing-card victory celebration.
- Meet the accessibility requirements in `DESIGN.md`, including visible focus, semantic controls, screen-reader announcements, high contrast, and reduced motion.
- Run entirely on the client with original local assets, no runtime framework dependency, no required network requests, and no proprietary Microsoft assets.
- Include the specified unit and browser tests and the configuration needed to run development, test, and production-build commands.

## Completion Standard

Work is complete only when the implementation satisfies the full **Definition of Done** in `DESIGN.md`, the production build succeeds, and all automated tests pass against the production configuration. Verify actual gameplay rather than relying only on code inspection: exercise legal and illegal moves, both draw modes, undo/restart, persistence, resizing, keyboard-only play, reduced motion, auto-completion, victory, and starting another game.

Finish all milestones and resolve defects discovered during verification. Do not stop after the rules engine, a static board, a happy-path demonstration, or an untested implementation. The goal is a cohesive, fully playable game with no known incomplete initial-release features, broken primary interactions, placeholder elements, or unresolved test/build failures.
