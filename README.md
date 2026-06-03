# Learn2Ludo

A browser-based Ludo game with a Python/FastAPI backend, vanilla JS frontend, configurable rules, heuristic bots, and an experimental reinforcement learning layer.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.12+ | |
| pip | any | comes with Python |
| Node.js / npm | any | only needed to compile SCSS |
| Sass | 1.x | `npm install -g sass` |

---

## Quick start

### 1. Clone

```bash
git clone https://github.com/HI-IDN/learn2ludo.git
cd learn2ludo
```

### 2. Virtual environment

```bash
# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1

# macOS / Linux
python -m venv .venv
source .venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the server

**Just run it:**
```bash
python -m uvicorn server:app --port 8000
```

**Development mode** (auto-reloads on Python file changes):
```bash
python -m uvicorn server:app --reload --port 8000
```

### 5. Open the app

```
http://localhost:8000
```

---

## CSS / SCSS

Styles are written in SCSS and must be compiled to CSS. Run this after any style change:

```bash
sass static/styles/main.scss static/styles/css/main.css --style=compressed
```

Install Sass once via npm if you don't have it:

```bash
npm install -g sass
```

---

## Project structure

```
config/         Runtime configuration and saved aggregate stats
data/           Local game records (gitignored — full JSON per game)
game/           Core engine, rules, session logic, bots
rl/             Reinforcement learning environment
static/
  components/   HTML fragments loaded dynamically
  js/           Frontend modules (app.js, lobby.js, board.js, …)
  styles/       SCSS source and compiled CSS
  index.html    Frontend entry point
server.py       FastAPI backend — game API, static serving
requirements.txt
```

---

## Running tests

```bash
pytest
```

Specific modules:
```bash
pytest game/test_engine.py
pytest game/test_gameplay.py
```

---

## Background

Ludo descends from the ancient Indian game **Pachisi**. The modern commercial version was patented in England in 1896 under the name *Ludo* (Latin: "I play"). Related variants include Parcheesi, Mensch ärgere Dich nicht, and Sorry!.

Despite simple rules, Ludo produces rich probabilistic and strategic behaviour — making it a useful sandbox for AI experimentation, reinforcement learning, and human–computer interaction research.
