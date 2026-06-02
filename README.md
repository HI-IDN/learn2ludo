# 🎲 Learn2Ludo

*A modular playground for board games, simulation, and AI experimentation.*

Learn2Ludo combines:

* 🧠 a Python game engine
* 🌐 a lightweight web server
* 🎮 a browser-based frontend
* ⚙️ configurable gameplay rules
* 🤖 reinforcement learning experimentation tools

The project is designed to separate gameplay logic, visualization, experimentation, and AI workflows into clean modular layers.

---

# 🏛️ Historical Background

Ludo traces its origins to the ancient Indian game **Pachisi**, a cross-and-circle race game played for centuries across South Asia. The modern commercial version was patented in **England in 1896** by Alfred Coller under the name **Ludo**, derived from the Latin phrase:

> *Ludo* — “I play”

Over time, the game evolved into an international family of related designs, including:

* 🇮🇳 **Pachisi**
* 🇺🇸 **Parcheesi**
* 🇩🇪 **Mensch ärgere Dich nicht**
* 🇺🇸 **Sorry!**

Each variation preserves the same core tension:

* 🎲 chance from dice/cards
* 🏁 racing toward home
* ⚔️ capturing opponents
* 🧠 tactical positioning
* 😈 occasional chaos

Despite its simple rules, Ludo creates surprisingly rich strategic and probabilistic behavior — making it a useful sandbox for:

* AI experimentation,
* reinforcement learning,
* simulation,
* and human–computer interaction.

Digital versions of Ludo experienced a major resurgence during the 2020s, particularly in mobile and online multiplayer formats.

*Source: Wikipedia – Ludo*

---

# 📦 Project Structure

```text id="a5nlw2"
config/                     Runtime configuration and persistent data
game/                       Core engine, rules, gameplay logic
rl/                         Reinforcement learning environment
static/                     Browser frontend (HTML, JS, CSS)
server.py                   Backend API and web server
```

---

# 🧩 Frontend Structure

The frontend is modularized into reusable components.

```text id="ecjlwm"
static/
├── components/             HTML fragments loaded dynamically
├── css/                    Styling layers
├── js/                     Frontend logic
├── config/                 Frontend runtime settings
├── index.html              Main frontend entrypoint
└── theme.css               Global theme variables
```

Key frontend files:

* `loader.js` → dynamically injects HTML components
* `app.js` → game UI logic
* `sound.js` → lightweight audio system
* `board.css` → board rendering styles
* `controls.css` → UI/control styling

---

# 🚀 Quick Start

## 1️⃣ Clone the repository

```bash id="u6ktgq"
git clone <repository-url>
cd learn2ludo
```

---

## 2️⃣ Create a virtual environment

### Windows (PowerShell)

```powershell id="ywdrxz"
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### Windows (MSYS2 / Git Bash)

```bash id="rhlcz7"
python -m venv .venv
source .venv/Scripts/activate
```

### Linux / macOS

```bash id="we3q76"
python -m venv .venv
source .venv/bin/activate
```

---

## 3️⃣ Install dependencies

```bash id="8vt5es"
pip install -r requirements.txt
```

Optional editable install:

```bash id="8gwy0h"
pip install -e .
```

---

# 🌐 Running the Server

Start the development server:

```bash id="o6pyot"
python server.py
```

or directly with uvicorn:

```bash id="4ut91x"
uvicorn server:app --reload
```

---

# 🎮 Open the App

Open in browser:

```text id="1lgm9v"
http://localhost:8000/static/index.html
```

If using the root route:

```text id="d5u79j"
http://localhost:8000
```

---

# 🎲 Gameplay Philosophy

Learn2Ludo is intentionally designed to support:

* classic Ludo rules,
* configurable house rules,
* deterministic simulation,
* and AI experimentation.

The engine separates:

* rules,
* gameplay state,
* rendering,
* and training infrastructure.

This makes it easier to:

* prototype rule variants,
* benchmark bots,
* replay games,
* or test RL agents.

---

# 💾 Saved Game JSON

Saved games include a `history` array of replay events. Move events keep the existing flat history shape and include justification metadata:

```json
{
  "type": "move",
  "player": 0,
  "piece": 2,
  "pawn_id": "R3",
  "from": 14,
  "to": 18,
  "justification": "This pawn is closest to home.",
  "timestamp": "2026-06-01T10:32:00Z"
}
```

Moves without a player-entered reason store `"justification": null`. Older saved games without these fields still load; missing move metadata is normalized to `null` during replay/load handling.

---

# ⚙️ Configurable Rules

Examples of configurable gameplay settings include:

* 🎨 player color assignment
* 🔊 sound and animation settings
* 🛡️ safe-square visualization
* 🎞️ movement animation speed
* 🎲 repeated-roll behavior
* 🤖 bot/human player mixes

The frontend persists many UI settings locally.

---

# 🤖 Reinforcement Learning

Experimental RL tooling lives in:

```text id="p4dkb8"
rl/
```

The current structure is intended to support:

* scripted bots,
* self-play,
* policy learning,
* evaluation environments,
* and future training pipelines.

---

# 🧪 Testing

Run all tests:

```bash id="5w9qg6"
pytest
```

Run specific modules:

```bash id="x8yot7"
pytest game/test_engine.py
pytest game/test_gameplay.py
```

---

# 🧠 High-Level Architecture

```text id="0yzv4m"
engine → gameplay → server API → browser UI
                     ↘
                       RL environment
```

---

# 🎯 Goals

Learn2Ludo is intended as:

* a playable game,
* a teaching/demo platform,
* a simulation sandbox,
* and an AI experimentation environment.

The architecture favors:

* modularity,
* readability,
* extensibility,
* and iterative experimentation.

---

# 📜 License

Released under the [MIT License](LICENSE).
