# Learn2Ludo — Codex Guidelines

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

## GitHub issues

- Every feature, bug fix, or improvement should have a corresponding GitHub issue.
- Before starting any non-trivial work, check whether an issue already exists (`gh issue list`). If not, recommend creating one — but confirm with the user first to avoid duplicates.
- Minor UI/UX polish items (cosmetic tweaks, label changes, small layout adjustments) can be grouped into a single umbrella issue rather than filed individually.
- Reference issues in commit messages (`refs #N`, `closes #N`) so work is traceable.
- **Never close an issue** (via comment, label, or `gh issue close`) without confirming with the user first. Use `closes #N` in commit messages only after the user says the feature is working and gives the go-ahead to commit.

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

## Adding a new bot

1. Subclass `BotPolicy` in `game/bots.py` (or a separate file) and implement `choose_move(valid_moves, game_state)`.
2. Call `register(MyBot())` so it appears in `/api/bots` and `/api/game/bot-move`.
3. RL bots load their model weights in `__init__`; `choose_move` runs inference.
4. No JS changes needed — `bots.js` calls `/api/game/bot-move` for all bot types.

## Tab / panel convention

Each tab has a matching `panel-<id>` div loaded as a component from `static/components/<id>.html`.
The tab list lives in `config/tabs.json` (server source of truth) with a JS fallback in `loadTabs()`.
