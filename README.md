# Ludo RL

A Ludo game engine with a reinforcement learning training scaffold and a polished web UI.

## Stack
- **Backend**: FastAPI (Python) — game engine, RL environment, REST API
- **Frontend**: Single-page HTML/JS served by FastAPI
- **RL**: Gym-style environment scaffold — plug in any algorithm

## Quick start

```bash
cd ludo_rl
pip install -r requirements.txt
python server.py
# → open http://localhost:8000
```

## Project layout

```
ludo_rl/
├── server.py              # FastAPI app, all API routes
├── requirements.txt
├── config/
│   └── tabs.json          # Admin-controlled tab config
├── game/
│   └── engine.py          # Pure Ludo game logic (no rendering)
├── rl/
│   └── environment.py     # Gym-style RL env + training scaffold
└── static/
    └── index.html         # Full frontend (tabs, board, admin)
```

## Tabs

| Tab | Default | Description |
|-----|---------|-------------|
| Settings | ✅ | Board rules, player types, display options |
| Stats & Replay | ✅ | Win rates, training history |
| Play | ❌ | Human vs human/bot game |
| Train | ❌ | RL training controls + live metrics |
| Bots | ❌ | Saved model management |
| Admin | ✅ | Tab visibility control (password protected) |

Toggle tab visibility in the **Admin** panel. First run: any password you enter becomes the admin password.

## Plugging in your RL algorithm

Edit `rl/environment.py` → `TrainingSession.run_episode()`:

```python
def run_episode(self):
    obs = self.env.reset()
    done = False
    while not done:
        # Replace this with your agent:
        action = my_agent.predict(obs)
        obs, reward, done, info = self.env.step(action)
```

The environment is gym-compatible:
- `obs`: float32 array, shape `(21,)` — piece positions + player context
- `action`: int `0–3` — index into valid moves list
- `reward`: float — shaped reward signal
- `done`: bool — game over

### Reward shaping (configurable via UI)
| Event | Default reward |
|-------|---------------|
| Win | +100 |
| Lose | −100 |
| Capture opponent | +10 |
| Get captured | −10 |
| Piece enters board | +3 |
| Per square advanced | +0.1 |
| Piece finishes | +20 |
| Turn penalty | −0.01 |

## Enabling more tabs

Log into Admin (http://localhost:8000 → Admin tab) and toggle any tab on. Changes persist in `config/tabs.json`.
