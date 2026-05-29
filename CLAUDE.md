# Learn2Ludo — Claude Guidelines

## Project overview

A browser-based Ludo game with a Python/FastAPI backend (`server.py`) and a vanilla JS frontend.
The RL training layer lives in `rl/` and the game engine in `game/`.

## Running the app

```
python -m uvicorn server:app --reload --port 8000
```

CSS is compiled from SCSS — run after any style change:
```
sass static/styles/main.scss static/styles/css/main.css --style=compressed
```

## Git workflow

- Only commit when the user confirms something is working as expected.
- Before starting a new feature, remind the user to confirm the current state so we can commit first.
- Write commit messages on the user's behalf when they give the go-ahead.

## Code style

- **No monoliths.** `app.js` owns global state and the init/tab/settings/game loop. Every distinct feature gets its own file. Current modules: `lobby.js`, `board.js`, `history.js`, `action.js`, `features.js`, `sound.js`.
- New frontend feature → new `static/js/<feature>.js` + new `static/styles/features/_<feature>.scss`, imported in `main.scss`.
- No comments explaining what the code does. Only add one when the *why* is non-obvious.
- No unnecessary abstractions. Three similar lines beats a premature helper.

## Frontend architecture

| File | Responsibility |
|---|---|
| `app.js` | Global state (`settings`, `gameState`, `tabConfig`), init, tab switching, settings I/O, game loop |
| `lobby.js` | Player select screen (count stepper, Human/Bot toggle, name input) |
| `board.js` | SVG board rendering |
| `history.js` | Move history list |
| `action.js` | Current-action / pawn-options panel |
| `features.js` | Pawn feature display |
| `sound.js` | Audio |

Globals shared across files: `settings`, `gameState`, `COLORS`, `PLAYER_COLORS`, `ENGINE`.
Functions called across files are on `window` implicitly (plain `function` declarations, no modules).

## SCSS structure

```
static/styles/
  base/         — tokens (_variables.scss) and reset
  layout/       — app shell, play layout
  components/   — reusable UI (button, card, toggle, …)
  features/     — page-specific (board, game-ui, lobby, settings, stats, …)
  main.scss     — imports everything in order: base → layout → components → features
```

## Tab / panel convention

Each tab has a matching `panel-<id>` div loaded as a component from `static/components/<id>.html`.
The tab list lives in `config/tabs.json` (server source of truth) with a JS fallback in `loadTabs()`.
