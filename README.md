# Solitaire — Green Felt Classics

A complete Klondike Solitaire game built with TypeScript, semantic HTML, CSS, and a small Canvas victory celebration. It has no runtime packages, accounts, or network services. All graphics, including the AI& card-back logo, are bundled locally.

## Play locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` to any static web host.

## Features

- Draw 1 and Draw 3 Klondike.
- Deterministic game numbers and same-deal replay.
- Drag/drop, click/tap, double-click/double-tap, and keyboard play.
- Unlimited undo, hints, and safe automatic completion.
- Classic-inspired optional scoring, timer, and move counter.
- Validated local game/preferences persistence.
- Responsive cards with 3D lift, perspective tilt, and physical flip animations.
- High contrast, reduced motion, and accessible live announcements.
- Original CSS/SVG-style card graphics with the AI& logo from [aiand.com](https://aiand.com/) on the card backs.
- A skippable Canvas victory cascade.

For complete rules and implementation requirements, see [DESIGN.md](./DESIGN.md). For the delivery objective, see [GOAL.md](./GOAL.md).

## Keyboard controls

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Move through controls and piles |
| Left / Right | Move between piles |
| Up / Down in a tableau | Choose the movable starting card |
| Enter / Space | Select, drop, or activate stock |
| F | Send selected card to its foundation |
| H | Show a hint |
| U or Ctrl/Cmd+Z | Undo |
| Escape | Cancel selection or dismiss a dialog |

## Verification

```sh
npm run test:unit       # Pure rules-engine tests
npm run test:browser    # Builds, starts production preview, runs browser tests
npm run test:all        # Unit tests, production build, browser tests
npm run typecheck       # Strict TypeScript verification
```

The Playwright configuration tests the **production build** at `http://127.0.0.1:4173`. Install its Chromium browser once if necessary:

```sh
npm run browser:install
```

Game state and preferences are stored only in browser `localStorage` under `green-felt-solitaire.save.v1`. Random deals are not guaranteed to be solvable.

## Cloudflare Pages deployment

The Wrangler configuration in `wrangler.jsonc` targets the `amd-buildday-solitaire` Cloudflare Pages project and the `dist/` output directory. With Cloudflare credentials available in the environment, run:

```sh
npm run deploy
```

The public custom domain is [amd-buildday-solitaire.jethachan.net](https://amd-buildday-solitaire.jethachan.net). Credentials are never stored in this repository.
